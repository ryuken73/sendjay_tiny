const com = require('../common')
//security level (low) : Every user can access all data.

module.exports = function(socket, param) {
	const _logTitle = param.ev, _roomid = param.returnTo
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param))
		com.sendToRoom(socket, _roomid, param)
	} catch (ex) {
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex)
	}
}
