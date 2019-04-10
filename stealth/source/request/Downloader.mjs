
import { Buffer } from 'buffer';

import { Emitter } from '../Emitter.mjs';
import { HTTP    } from '../protocol/HTTP.mjs';
import { HTTPS   } from '../protocol/HTTPS.mjs';
import { SOCKS   } from '../protocol/SOCKS.mjs';



const compute = function() {

	let timeline = this.__bandwidth.timeline;
	let index    = timeline.findIndex((v) => v === null);

	if (index !== -1 && index > 0) {
		return timeline.slice(0, index).reduce((a, b) => a + b, 0) / (index + 1);
	} else if (index !== -1) {
		return timeline[0];
	} else {
		return timeline.reduce((a, b) => a + b, 0) / timeline.length;
	}

};

const measure = function() {

	let old_length = this.__bandwidth.length;
	let new_length = this.buffer.payload.length;
	let new_index  = this.__bandwidth.index;

	this.__bandwidth.timeline[new_index] = new_length - old_length;


	this.__bandwidth.length = this.buffer.payload.length;
	this.__bandwidth.index += 1;
	this.__bandwidth.index %= this.__bandwidth.timeline.length;


	let bandwidth = compute.call(this);
	if (bandwidth !== null && bandwidth < 0.01) {

		if (this.connection !== null) {
			this.connection.socket.end();
		}

	}

};



const _Request = function(ref) {

	Emitter.call(this);


	this.buffer = {
		start:   0,
		length:  null,
		partial: false,
		payload: Buffer.from('', 'utf8')
	};

	this.connection = null;
	this.ref        = ref;

	this.__bandwidth = {
		index:    0,
		length:   0,
		timeline: new Array(30).fill(null)
	};
	this.__interval  = null;

};


_Request.prototype = Object.assign({}, Emitter.prototype, {

	init: function() {

		if (this.ref.headers !== null && this.ref.payload !== null) {

			let tmp = this.ref.headers['content-length'] || null;
			if (tmp !== null) {

				let num = parseInt(tmp, 10);
				if (Number.isNaN(num) === false) {

					let length = num;
					if (length === this.ref.payload.length) {

						this.buffer.length  = num;
						this.buffer.payload = this.ref.payload;

						if (this.__interval !== null) {
							clearInterval(this.__interval);
							this.__interval = null;
						}

						return true;

					}

				}

			}

		}


		if (this.connection === null) {

			let proxy = this.ref.proxy || null;
			if (proxy !== null) {

				this.__interval = setInterval(() => measure.call(this), 1000);
				this.connection = SOCKS.connect(this.ref, this.buffer);

			} else if (this.ref.protocol === 'https') {

				this.__interval = setInterval(() => measure.call(this), 1000);
				this.connection = HTTPS.connect(this.ref, this.buffer);

			} else if (this.ref.protocol === 'http') {

				this.__interval = setInterval(() => measure.call(this), 1000);
				this.connection = HTTP.connect(this.ref, this.buffer);

			}


			if (this.connection !== null) {

				this.connection.on('@connect', (socket) => {

					let hostname = null;

					if (this.ref.hosts.length > 0) {
						hostname = this.ref.hosts[0].ip;
					}

					if (this.ref.domain !== null) {

						if (this.ref.subdomain !== null) {
							hostname = this.ref.subdomain + '.' + this.ref.domain;
						} else {
							hostname = this.ref.domain;
						}

					}


					if (this.ref.protocol === 'https') {

						HTTPS.send(socket, {
							headers: {
								'@method': 'GET',
								'@path':   this.ref.path,
								'@query':  this.ref.query,
								'host':    hostname,
								'range':   'bytes=' + this.buffer.start + '-'
							}
						});

					} else if (this.ref.protocol === 'http') {

						HTTP.send(socket, {
							headers: {
								'@method': 'GET',
								'@path':   this.ref.path,
								'@query':  this.ref.query,
								'host':    hostname,
								'range':   'bytes=' + this.buffer.start + '-'
							}
						});

					}

				});

				this.connection.on('@disconnect', () => {

					if (this.__interval !== null) {
						clearInterval(this.__interval);
						this.__interval = null;
					}

				});

				return true;

			}

		}


		return false;

	},

	bandwidth: function() {

		if (this.connection !== null) {
			return compute.call(this);
		}

		return null;

	}

});



const Downloader = {

	check: function(ref, config, callback) {

		ref      = ref instanceof Object          ? ref      : null;
		config   = config instanceof Object       ? config   : null;
		callback = typeof callback === 'function' ? callback : null;


		if (ref !== null && config !== null && callback !== null) {

			let protocol = ref.protocol;
			let type     = ref.mime.type;

			if (protocol === 'https' || protocol === 'http') {
				callback(config.mode[type] === true);
			} else {
				callback(false);
			}

		} else if (callback !== null) {
			callback(false);
		}

	},

	download: function(ref, config, callback) {

		ref      = ref instanceof Object          ? ref      : null;
		config   = config instanceof Object       ? config   : null;
		callback = typeof callback === 'function' ? callback : null;


		if (ref !== null && config !== null && callback !== null) {

			let allowed = config.mode[ref.mime.type] === true;
			if (allowed === true) {
				callback(new _Request(ref));
			} else {
				callback(null);
			}

		} else if (callback !== null) {
			callback(null);
		}

	}

};


export { Downloader };
