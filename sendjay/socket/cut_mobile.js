const config = require('../config')
const com = require('../common')
//security level (high) : User can access only one's own data.

module.exports = function(socket, param) {
	const _logTitle = param.ev
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param))	
		const resVeri = com.verifyWithSocketUserId(param.data.userid, socket.userid)
		if (resVeri != '') throw new Error(resVeri)
		if (socket.userkey.startsWith(com.cons.m_key)) throw new Error("Mobile userkey cannot do this job.")
		socket.emit(com.cons.sock_ev_common, param) //returns to web with no result
		com.sendToMyOtherSocket(socket, param) //goes to mobile app (for logout)
	} catch (ex) { //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param))
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex)
	}
}
