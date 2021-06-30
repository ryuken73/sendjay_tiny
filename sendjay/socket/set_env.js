const config = require('../config')
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
//security level (high) : User can access only one's own data (with sql as follows).

module.exports = async function(socket, param) {
	const _logTitle = param.ev
	let conn
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param))
		const resVeri = com.verifyWithSocketUserId(param.data.userid, socket.userid)
		if (resVeri != '') throw new Error(resVeri)	
		const _kind = param.data.kind		
		const _userid = param.data.userid
		conn = await wsmysql.getConnFromPool(global.pool)
		if (_kind == 'noti' || _kind == 'dispmem') {
			const _value = param.data.value
			const _roomid = param.data.roomid
			if (_kind == 'noti') {
				await wsmysql.query(conn, "UPDATE " + com.tbl.roomdtl + " SET NOTI = ? WHERE ROOMID = ? AND USERID = ? ", [_value, _roomid, _userid]) 
				socket.emit(com.cons.sock_ev_common, param)	
				com.sendToMyOtherSocket(socket, param)
			} else { //mobile only
				await wsmysql.query(conn, "UPDATE " + com.tbl.roomdtl + " SET DISPMEM = ? WHERE ROOMID = ? AND USERID = ? ", [_value, _roomid, _userid])
				socket.emit(com.cons.sock_ev_common, param)	 
			}					
		} else if (_kind == 'userinfo') { //No need to update table since it was already updated. You just broadcast it inside namespace.
			com.broadcast(socket, com.cons.sock_ev_set_env, param.data, 'all')
		} //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param))
	} catch (ex) {
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex)
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
