
import { Emitter    } from './Emitter.mjs';
import { IP         } from './parser/IP.mjs';
import { URL        } from './parser/URL.mjs';
import { Blocker    } from './request/Blocker.mjs';
import { Downloader } from './request/Downloader.mjs';
import { Filter     } from './request/Filter.mjs';
import { Optimizer  } from './request/Optimizer.mjs';



let _id = 0;

const Request = function(data, stealth) {

	let settings = Object.assign({}, data);


	Emitter.call(this);


	this.id       = 'request-' + _id++;
	this.config   = settings.config || {
		domain: null,
		mode: {
			text:  false,
			image: false,
			audio: false,
			video: false,
			other: false
		}
	};
	this.flags    = {
		refresh: false,
		webview: false
	};
	this.prefix   = settings.prefix || '/stealth/';
	this.ref      = null;
	this.response = null;
	this.retries  = 0;
	this.stealth  = stealth;
	this.timeline = {
		init:     null,
		error:    null,
		kill:     null,
		cache:    null,
		block:    null,
		mode:     null,
		filter:   null,
		connect:  null,
		download: null,
		optimize: null,
		response: null
	};
	this.url      = null;


	let ref = settings.ref || null;
	let url = settings.url || null;

	if (ref !== null) {

		this.ref = ref;
		this.url = this.ref.url;

	} else if (url !== null) {

		this.ref = URL.parse(url);
		this.url = this.ref.url;

	}


	this.on('init', () => {

		this.timeline.init = Date.now();

		this.stealth.server.services.redirect.read(this.ref, (redirect) => {

			let location = redirect.headers['location'] || null;
			if (location !== null) {
				this.emit('redirect', [ redirect, true ]);
			} else {
				this.emit('cache');
			}

		});

	});

	this.on('cache', () => {

		if (this.flags.refresh === true) {

			this.emit('stash');

		} else {

			this.stealth.server.services.cache.read(this.ref, (response) => {

				this.timeline.cache = Date.now();

				if (response.payload !== null) {
					this.response = response.payload;
					this.emit('response', [ this.response ]);
				} else {
					this.emit('stash');
				}

			});

		}

	});

	this.on('stash', () => {

		if (this.flags.refresh === true) {

			this.emit('block');

		} else {

			this.stealth.server.services.stash.read(this.ref, (response) => {

				this.timeline.stash = Date.now();

				if (response.payload !== null) {

					if (response.payload.headers !== null) {

						delete response.payload.headers['service'];
						delete response.payload.headers['event'];
						delete response.payload.headers['method'];

						if (Object.keys(response.payload.headers).length > 0) {
							this.ref.headers = response.payload.headers;
						}

					}

					if (response.payload.payload !== null) {
						this.ref.payload = response.payload.payload;
					}

				}

				this.emit('block');

			});

		}

	});

	this.on('block', () => {

		Blocker.check(this.stealth.settings.blockers, this.ref, (blocked) => {

			this.timeline.block = Date.now();

			if (blocked === true) {

				// Always Block, no matter the User's Config
				this.config.mode.text  = false;
				this.config.mode.image = false;
				this.config.mode.audio = false;
				this.config.mode.video = false;
				this.config.mode.other = false;

				this.emit('error', [{ code: 403 }]);

			} else {
				this.emit('mode');
			}

		});

	});

	this.on('mode', () => {

		let mime    = this.ref.mime;
		let allowed = this.config.mode[mime.type] === true;

		this.timeline.mode = Date.now();

		if (allowed === true) {
			this.emit('filter');
		} else if (mime.ext === 'html') {
			this.emit('error', [{ type: 'mode' }]);
		} else {
			this.emit('error', [{ code: 403 }]);
		}

	});

	this.on('filter', () => {

		Filter.check(this.stealth.settings.filters, this.ref, (allowed) => {

			this.timeline.filter = Date.now();

			if (allowed === true) {
				this.emit('connect');
			} else if (this.ref.mime.ext === 'html') {
				this.emit('error', [{ type: 'filter' }]);
			} else {
				this.emit('error', [{ code: 403 }]);
			}

		});

	});

	this.on('connect', () => {

		if (this.ref.hosts.length > 0) {

			this.timeline.connect = Date.now();
			this.emit('download');

		} else {

			this.stealth.server.services.host.read({
				domain:    this.ref.domain,
				subdomain: this.ref.subdomain
			}, (response) => {

				this.timeline.connect = Date.now();

				if (response.payload !== null) {

					let ipv4 = IP.parse(response.payload.ipv4);
					if (ipv4.type === 'v4') {
						this.ref.hosts.push(ipv4);
					}

					let ipv6 = IP.parse(response.payload.ipv6);
					if (ipv6.type === 'v6') {
						this.ref.hosts.push(ipv6);
					}

				}

				if (this.ref.hosts.length > 0) {
					this.emit('download');
				} else {
					this.emit('error', [{ type: 'host' }]);
				}

			});

		}

	});

	this.on('download', () => {

		Downloader.check(this.ref, this.config, (result) => {

			if (result === true) {

				Downloader.download(this.ref, this.config, (download) => {

					this.timeline.download = Date.now();

					if (download !== null) {

						download.on('progress', (partial, progress) => {
							this.stealth.server.services.stash.save(Object.assign({}, this.ref, partial), () => {});
							this.emit('progress', [ partial, progress ]);
						});

						download.on('timeout', (partial) => {

							if (partial !== null) {

								this.retries++;

								if (this.retries < 10) {

									this.stealth.server.services.stash.save(Object.assign({}, this.ref, partial), (result) => {

										if (result === true) {

											this.ref.headers = partial.headers;
											this.ref.payload = partial.payload;
											this.emit('download');

										}

									});

								} else {
									this.emit('error', [{ type: 'request', cause: 'socket-stability' }]);
								}

							} else {
								this.emit('error', [{ type: 'request', cause: 'socket-timeout' }]);
							}

						});

						download.on('error', (error) => {

							if (error.type === 'stash') {

								this.stealth.server.services.stash.remove(this.ref, () => {

									this.ref.headers = null;
									this.ref.payload = null;
									this.emit('download');

								});

							} else {
								this.emit('error', [ error ]);
							}

						});

						download.on('redirect', (response) => {

							this.stealth.server.services.stash.remove(this.ref, () => {

								let location = response.headers['location'] || null;
								if (location !== null) {
									this.emit('redirect', [ response, false ]);
								} else {
									this.emit('error', [{ type: 'request', cause: 'headers-location' }]);
								}

							});

						});

						download.on('response', (response) => {

							this.stealth.server.services.stash.remove(this.ref, () => {
								this.ref.headers = null;
								this.ref.payload = null;
							});

							this.response = response;
							this.emit('optimize');

						});

						download.init();

					} else {
						this.emit('error', [{ code: 403 }]);
					}

				});

			} else {
				this.emit('error', [{ code: 403 }]);
			}

		});

	});

	this.on('optimize', () => {

		this.emit('response', [ this.response ]);

		// Optimizer.check(this.ref, this.config, (result) => {

		// 	if (result === true) {

		// 		Optimizer.optimize(this.ref, this.config, this.response, (response) => {

		// 			// TODO: render stuff with different URLs
		// 			// and prefix everything to /stealth
		// 			console.log('optimize()', response);

		// 		});

		// 	} else {
		// 		this.emit('response', [ this.response ]);
		// 	}

		// });

	});

	this.on('redirect', (response, ignore) => {

		ignore = typeof ignore === 'boolean' ? ignore : false;


		if (ignore === true) {

			// XXX: Do nothing

		} else if (response !== null && response.headers !== null) {

			let location = response.headers['location'] || null;
			if (location !== null) {

				this.stealth.server.services.redirect.save(Object.assign({}, this.ref, {
					location: location
				}), () => {});

			}

		}

	});

	this.on('response', (response) => {

		if (response !== null && response.payload !== null) {

			if (this.response !== response) {
				this.response = response;
			}

			this.stealth.server.services.cache.save(Object.assign({}, this.ref, response), (result) => {

				if (result === true) {

					this.stealth.server.services.stash.remove(this.ref, (result) => {

						if (result === true) {
							this.ref.headers = null;
							this.ref.payload = null;
						}

					});

				}

			});

		}

	});

};


Request.prototype = Object.assign({}, Emitter.prototype, {

	init: function() {

		if (this.timeline.init === null) {
			this.emit('init');
		}

	},

	set: function(key, val) {

		key = typeof key === 'string'  ? key : null;
		val = typeof val === 'boolean' ? val : null;


		if (key !== null && val !== null) {

			let exists = this.flags[key] !== undefined;
			if (exists === true) {

				this.flags[key] = val;

				return true;

			}

		}


		return false;

	},

	kill: function() {

		if (this.timeline.kill === null) {
			this.timeline.kill = Date.now();

		}

		// TODO: Stop download(s)

	}

});


export { Request };

