
import { isFunction, isNumber, isObject, isString } from './POLYFILLS.mjs';

import { Emitter } from './Emitter.mjs';
import { Client  } from './Client.mjs';
import { Tab     } from './Tab.mjs';
import { URL     } from './parser/URL.mjs';



const Browser = function() {

	Emitter.call(this);


	this.client   = new Client(this);
	this.settings = {
		internet: {
			connection: 'mobile',
			torify:     false,
		},
		filters: [],
		hosts:   [],
		modes:   [],
		peers:   []
	};
	this.tab      = null;
	this.tabs     = [];

};


Browser.prototype = Object.assign({}, Emitter.prototype, {

	back: function() {

		if (this.tab !== null) {

			let index = this.tab.history.indexOf(this.tab.url);
			if (index !== -1) {

				let url = this.tab.history[index - 1] || null;
				if (url !== null) {

					this.tab.url = url;
					this.tab.ref = this.parse(url);
					this.emit('refresh', [ this.tab, this.tabs, false ]);

				}

			}

		}

	},

	connect: function(host, port, callback) {

		host     = isString(host)       ? host     : null;
		port     = isNumber(port)       ? port     : null;
		callback = isFunction(callback) ? callback : null;


		let client = this.client;
		if (client !== null && host !== null && port !== null) {

			client.connect(host, port, (result) => {

				if (result === true) {

					client.services.settings.read(null, (result) => {

						if (callback !== null) {
							callback(result !== null);
						}

					});

				}

			});

		} else if (callback !== null) {
			callback(false);
		}

	},

	disconnect: function() {

		let client = this.client;
		if (client !== null) {
			client.disconnect();
		}

	},

	get: function(url) {

		url = isString(url) ? url : null;


		let config = {
			domain: null,
			mode:   {
				text:  false,
				image: false,
				audio: false,
				video: false,
				other: false
			}
		};

		if (url !== null) {

			let ref     = this.parse(url);
			let rdomain = ref.domain || null;
			if (rdomain !== null) {

				let rsubdomain = ref.subdomain || null;
				if (rsubdomain !== null) {
					rdomain = rsubdomain + '.' + rdomain;
				}

			}

			let rprotocol = ref.protocol || null;
			if (rprotocol === 'stealth') {

				config.mode.text  = true;
				config.mode.image = true;
				config.mode.audio = true;
				config.mode.video = true;
				config.mode.other = true;

			} else if (rdomain !== null) {

				let modes = this.settings.modes.filter((m) => rdomain.endsWith(m.domain));
				if (modes.length > 1) {

					return modes.sort((a, b) => {
						if (a.domain.length > b.domain.length) return -1;
						if (b.domain.length > a.domain.length) return  1;
						return 0;
					})[0];

				} else if (modes.length === 1) {

					return modes[0];

				}

			}

		}

		return config;

	},

	kill: function(tab, callback) {

		tab      = tab instanceof Tab   ? tab      : null;
		callback = isFunction(callback) ? callback : null;


		if (tab !== null) {

			if (this.tabs.includes(tab) === true) {

				this.tabs.splice(this.tabs.indexOf(tab), 1);

				if (Function.isFunction(tab.kill)) {
					tab.kill();
				}

			}

			this.emit('kill', [ tab, this.tabs ]);


			if (this.tabs.length > 0) {

				this.tab = null;
				this.show(this.tabs[this.tabs.length - 1]);

			} else if (this.tabs.length === 0) {

				this.tab = null;

				let welcome = this.open('stealth:welcome');
				if (welcome !== null) {
					this.show(welcome);
				}

			}


			if (callback !== null) {
				callback(tab);
			}

			return true;

		}

	},

	navigate: function(url) {

		if (this.tab !== null) {

			if (this.tab.url !== url) {

				let index1 = this.tab.history.indexOf(this.tab.url);
				if (index1 < this.tab.history.length - 1) {
					this.tab.history.splice(index1 + 1);
				}

				this.tab.url = url;
				this.tab.ref = this.parse(url);

				let index2 = this.tab.history.indexOf(url);
				if (index2 !== -1) {
					this.tab.history.splice(index2, 1);
				}

				this.tab.history.push(url);

			}

			this.refresh();

		} else {

			let tab = this.open(url);
			if (tab !== null) {

				let index1 = tab.history.indexOf(tab.url);
				if (index1 < tab.history.length - 1) {
					tab.history.splice(index1 + 1);
				}

				tab.url = url;

				let index2 = tab.history.indexOf(url);
				if (index2 !== -1) {
					tab.history.splice(index2, 1);
				}

				tab.history.push(url);

				this.show(tab);

			}

		}

	},

	next: function() {

		if (this.tab !== null) {

			let index = this.tab.history.indexOf(this.tab.url);
			if (index !== -1) {

				let url = this.tab.history[index + 1] || null;
				if (url !== null) {

					this.tab.url = url;
					this.tab.ref = this.parse(url);
					this.emit('refresh', [ this.tab, this.tabs, false ]);

				}

			}

		}

	},

	open: function(url) {

		url = isString(url) ? url : null;


		if (url !== null) {

			let ref = this.parse(url);
			let tab = this.tabs.find((t) => t.url === ref.url) || null;
			if (tab !== null) {

				return tab;

			} else {

				tab = new Tab({
					config: this.get(ref.url),
					ref:    ref,
					url:    ref.url
				});

				this.tabs.push(tab);
				this.emit('open', [ tab, this.tabs ]);

				return tab;

			}

		}


		return null;

	},

	parse: function(url) {

		url = isString(url) ? url : null;


		return URL.parse(url);

	},

	pause: function() {

		if (this.tab !== null) {
			this.emit('pause', [ this.tab, this.tabs, true ]);
		}

	},

	refresh: function() {

		if (this.tab !== null) {
			this.emit('refresh', [ this.tab, this.tabs, true ]);
		}

	},

	set: function(config) {

		config = isObject(config) ? config : null;


		if (config !== null && Object.isObject(config.mode)) {

			let domain = config.domain || null;
			if (domain !== null) {

				let tmp1 = this.get(domain);
				let tmp2 = {
					domain: config.domain,
					mode:   {
						text:  false,
						image: false,
						audio: false,
						video: false,
						other: false
					}
				};

				Object.keys(config.mode).forEach((type) => {
					tmp2.mode[type] = config.mode[type] === true;
				});


				config = null;

				if (tmp1.domain === null) {

					config = tmp2;
					this.settings.modes.push(config);
					this.client.services.mode.save(config, () => {});

				} else if (tmp1.domain === tmp2.domain) {

					config = tmp1;

					let diff = false;

					Object.keys(tmp1.mode).forEach((type) => {
						if (tmp1.mode[type] !== tmp2.mode[type]) {
							tmp1.mode[type] = tmp2.mode[type];
							diff = true;
						}
					});

					if (diff === true) {
						this.client.services.mode.save(tmp1, () => {});
					}

				} else if (tmp1.domain !== tmp2.domain) {

					config = tmp2;
					this.settings.modes.push(config);
					this.client.services.mode.save(config, () => {});

				}


				if (config !== null) {

					this.tabs.forEach((tab) => {

						let tconfig = tab.config;
						if (tconfig.domain !== null && config.domain !== null) {

							if (
								tconfig.domain === config.domain
								&& tconfig !== config
							) {
								tab.config = config;
							}

						} else if (tconfig.domain === null && config.domain !== null) {

							let tdomain = tab.ref.domain || null;
							if (tdomain !== null) {

								let tsubdomain = tab.ref.subdomain || null;
								if (tsubdomain !== null) {
									tdomain = tsubdomain + '.' + tdomain;
								}

								if (tdomain === config.domain && tconfig !== config) {
									tab.config = config;
								}

							}

						}

					});

					if (this.tab !== null && this.tab.config === config) {
						this.emit('change', [ this.tab ]);
					}

				}


				return true;

			}

		}


		return false;

	},

	show: function(tab) {

		tab = tab instanceof Tab ? tab : null;


		if (tab !== null) {

			if (this.tabs.includes(tab) === false) {
				this.tabs.push(tab);
			}

			if (this.tab !== null) {
				this.emit('hide', [ this.tab, this.tabs ]);
			}

			if (this.tab !== tab) {
				this.tab = tab;
				this.emit('show', [ this.tab, this.tabs ]);
			}

			return true;

		} else if (tab === null) {

			if (this.tab !== null) {
				this.emit('hide', [ this.tab, this.tabs ]);
			}

			if (this.tabs.length > 0) {
				this.tab = this.tabs[this.tabs.length - 1];
				this.emit('show', [ this.tab, this.tabs ]);
			} else {
				this.tab = null;
			}

			return true;

		}


		return false;

	}

});


export { Browser };

