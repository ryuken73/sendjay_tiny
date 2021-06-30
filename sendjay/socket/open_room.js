const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
//security level (high) : User can access only one's own data.
//remoteJoining room for valid socket

module.exports = async function(socket, param) { 
	const _logTitle = param.ev, _roomid = param.returnTo
	let conn, _nicknm
	try { //com.procWarn(null, socket, _logTitle, JSON.stringify(param), _roomid)
		const userid = param.data.userid
		const resVeri = com.verifyWithSocketUserId(userid, socket.userid)
		if (resVeri != '') throw new Error(resVeri)
		conn = await wsmysql.getConnFromPool(global.pool)
		let qry = "SELECT B.USERID, B.USERNM, B.NICKNM, A.ROOMNM, A.NICKNM MAINNM, A.MASTERID "
		qry += "     FROM " + com.tbl.roomdtl + " B "
		qry += "    INNER JOIN " + com.tbl.roommst + " A ON B.ROOMID = A.ROOMID AND B.STATE <> 'L' "
		qry += "    WHERE B.ROOMID = ? "
		qry += "    ORDER BY B.USERNM, USERID "
		const data = await wsmysql.query(conn, qry, [_roomid])
		const len = data.length
		if (len == 0) throw new Error(ws.cons.MSG_NO_DATA + ' (roomid)')
		let userkeyArr = [], userkeySocketArr = [], arrUseridSortedByUsernm = [], arrUsernmSortedByUsernm = []
		for (let i = 0; i < len; i++) {
			const _userid = data[i].USERID
			if (_userid == param.data.userid) _nicknm = data[i].NICKNM				
			const _usernm = data[i].USERNM
			arrUseridSortedByUsernm.push(_userid)
			arrUsernmSortedByUsernm.push(_usernm)
			const w_userkey = com.cons.w_key + _userid
			const m_userkey = com.cons.m_key + _userid
			userkeyArr.push(w_userkey)
            userkeyArr.push(m_userkey)
			const arr = await com.getUserkeySocket(w_userkey)
			const brr = await com.getUserkeySocket(m_userkey)
			if (arr.length > 0) userkeySocketArr = userkeySocketArr.concat(arr)
			if (brr.length > 0) userkeySocketArr = userkeySocketArr.concat(brr)
		}
		if (param.data.from != 'dupchk') {
			await com.joinRoomWithUserkeySocketArr(userkeySocketArr, _roomid) //Overwriting joining will be ok.
		}
		const dataR = await wsmysql.query(conn, "SELECT DISPMEM FROM " + com.tbl.roomdtl + " WHERE ROOMID = ? AND USERID = ? ", [_roomid, userid]) 
		if (dataR.length == 0) throw new Error(ws.cons.MSG_NO_DATA + ' (roomid, userid)')
		param.data.dispmem = dataR[0].DISPMEM
		param.data.roomid = _roomid
		param.data.roomnm = JSON.parse(data[0].ROOMNM) // "{\"roomnm\":\"111\"~}" => {"roomnm":"111"~} : .parse needed especially in android
		param.data.nicknm = _nicknm
		param.data.mainnm = data[0].MAINNM
		param.data.masterid = data[0].MASTERID
		param.data.receiverid = arrUseridSortedByUsernm
		param.data.receivernm = arrUsernmSortedByUsernm
		param.data.userkeys = userkeyArr
		socket.emit(com.cons.sock_ev_common, param)
	} catch (ex) { //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param), _roomid)
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
