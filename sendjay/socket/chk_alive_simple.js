const com = require('../common')
//security level (low) : Every user can access all data.

module.exports = async (socket, param) => {
	const _logTitle = param.ev
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param))
		let userkeySocketArr = [], userkeyArr = []
		for (let userkey of param.data.userkeys) { //[userkey1,userkey2..]
			const arr = await com.getUserkeySocket(userkey)			
			if (arr.length > 0) userkeySocketArr = userkeySocketArr.concat(arr)
		}
		const sockets = await global.jay.adapter.sockets(new Set())
		for (let key of userkeySocketArr) {
			const _obj = com.getUserkeySocketid(key)
			if (sockets.has(_obj.socketid)) userkeyArr.push(_obj.userkey)
		}
		param.data = userkeyArr
		socket.emit(com.cons.sock_ev_common, param)
	} catch (ex) {
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex)
	}
}
