const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
//security level (high) : User can access only one's own data.
//Before creating new chat room, if same members' room exists then that room will be opened. Data before leaving room is no problem since they are already deleted.
//새 채팅방을 개설하기 전에 기존에 같은 멤버들의 방이 있으면 그 방을 열기. 퇴장한 후라도 이미 이전 데이터는 삭제되었으므로 문제없음.

module.exports = async function(socket, param) {
	const _logTitle = param.ev, _roomid = param.returnTo
	let conn
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param), _roomid)
		const resVeri = com.verifyWithSocketUserId(param.data.masterid, socket.userid)
		if (resVeri != '') throw new Error(resVeri)
		const _useridArr = param.data.userids
		const _chkSameMembers = _useridArr.length <= com.cons.max_check_same_members ? true : false
		_useridArr.sort((a, b) => { return (a > b) ? 1 : (b > a) ? -1 : 0 }) //in order to query sql with alphabetical users
		const _useridJoined = _useridArr.join(com.cons.indeli)
		const _useridJoinedEasy = _useridArr.join(com.cons.easydeli)
		conn = await wsmysql.getConnFromPool(global.pool)
		await wsmysql.txBegin(conn) //SELECT SQL for A_ROOMMEM_TBL is only for here (The reason why A_ROOMMEM_TBL is needed)
		const dataMem = await wsmysql.query(conn, "SELECT ROOMID FROM " + com.tbl.roommem + " WHERE MEMBERS = ? AND ROOMID <> '' ORDER BY CDT DESC LIMIT 1 ", [_useridJoinedEasy])
		if (dataMem.length > 0) { //same member's room found. but it might be multi because of invite_user module
			param.data.from = 'dupchk'
			param.data.roomid = dataMem[0].ROOMID
			param.data.prevroomid = _roomid
		} else {
			const qry = "SELECT USER_NM, USER_ID FROM " + com.tbl.user + " WHERE USER_ID IN ('" + _useridJoined + "') AND DEL_DATE = '' ORDER BY USER_NM, USER_ID "
			const data = await wsmysql.query(conn, qry, null)
			const len = data.length
			if (len == 0) throw new Error(ws.cons.MSG_NO_DATA + ' (Z_USER_TBL)')
			const roomnmObj = com.setRoomnmWithUsernm(data, 'USER_NM', 'USER_ID')
			for (let i = 0; i < len; i++) {
				const _userid = data[i].USER_ID
				const _usernm = data[i].USER_NM
				const iqry = "INSERT INTO " + com.tbl.roomdtl + " (ROOMID, USERID, USERNM, CDT) VALUES (?, ?, ?, sysdate(6)) "
				await wsmysql.query(conn, iqry, [_roomid, _userid, _usernm])
			}
			const iqry = "INSERT INTO " + com.tbl.roommst + " (ROOMID, ROOMNM, MASTERID, MASTERNM, MEMCNT, CDT) VALUES (?, ?, ?, ?, ?, sysdate(6)) "
			await wsmysql.query(conn, iqry, [_roomid, JSON.stringify(roomnmObj), param.data.masterid, param.data.masternm, len])
			if (_chkSameMembers) await wsmysql.query(conn, "INSERT INTO " + com.tbl.roommem + " (ROOMID, MEMBERS, CDT) VALUES (?, ?, sysdate(6)) ", [_roomid, _useridJoinedEasy])
		} 
		await wsmysql.txCommit(conn)
		socket.emit(com.cons.sock_ev_common, param)
	} catch (ex) { //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param), _roomid)
		if (conn) await wsmysql.txRollback(conn)
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
