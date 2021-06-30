const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const express = require('express')
const router = express.Router()
//security level (high) : User can access only one's own data.

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			let rs = ws.web.rsInit()
			conn = await wsmysql.getConnFromPool(global.pool)
			const dateFr = ws.util.setDateAdd(new Date(), com.cons.max_days_to_fetch)
			const _userid = req.cookies.userid
			const _roomid = req.query.roomid
			const _msgid = req.query.msgid
			const _type = req.query.type
			if (_roomid) {
				if (_msgid) { //from mobile (before noti)
					const qry = "SELECT COUNT(*) UNREAD FROM " + com.tbl.msgdtl + " WHERE MSGID = ? AND ROOMID = ? AND RECEIVERID = ? " +
								"   AND STATE = '' AND RECEIVERID <> SENDERID "
					rs.list = await wsmysql.query(conn, qry, [_msgid, _roomid, _userid])
				} else { //no unread display in case of invite/leave msg
					const qry = "SELECT COUNT(*) UNREAD FROM " + com.tbl.msgdtl + " A WHERE ROOMID = ? AND RECEIVERID = ? AND STATE = '' " + 
								"   AND CDT >= ? AND RECEIVERID <> SENDERID " +
								"   AND (SELECT TYPE FROM " + com.tbl.msgmst + " WHERE MSGID = A.MSGID) NOT IN ('invite', 'leave') "
					rs.list = await wsmysql.query(conn, qry, [_roomid, _userid, dateFr])
				}
			} else if (_type == 'U') { //from ChatService.kt. LASTCHKDT field below is for reconnecting socket on Mobile.
				await wsmysql.query(conn, "UPDATE " + com.tbl.user + " SET LASTCHKDT = sysdate(6) WHERE USER_ID = ? ", [_userid])
			} else { //Without roomid, you just query lastchkdt field(datetime for last message arrival). roomid가 없을 때는 최종 메시지 도착 일시 이후만 읽으면 됨 (재연결시 필요).
				const dataS = await wsmysql.query(conn, "SELECT LASTCHKDT FROM " + com.tbl.user + " WHERE USER_ID = ? " , [_userid])
				const dt = (dataS.length > 0 && dataS[0].LASTCHKDT != null) ? dataS[0].LASTCHKDT : dateFr
				let qry = "SELECT ROOMID, COUNT(*) UNREAD, " //ADDINFO = for mobile only
				qry += "		  (SELECT CONCAT(MSGID, '" + com.cons.deli + "', CONCAT(CDT, '" + com.cons.deli + "', CONCAT(TYPE, '" + com.cons.deli + "', BODY))) " 
				qry += "		     FROM " + com.tbl.msgmst + " WHERE ROOMID = A.ROOMID AND STATE = '' AND CDT >= '" + dt + "' ORDER BY CDT DESC LIMIT 1) ADDINFO "
				qry += "     FROM " + com.tbl.msgdtl + " A WHERE RECEIVERID = ? AND STATE = '' AND CDT >= ? AND RECEIVERID <> SENDERID GROUP BY ROOMID "
				rs.list = await wsmysql.query(conn, qry, [_userid, dt]) //console.log(rs.list.length+"====qry_unread====reconnect")
			}
			resolve(rs)
		} catch (ex) {
			reject(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	})
}

router.get('/', async (req, res) => {
	const _logTitle = 'qry_unread.router.get'
	try {
		if (req.query.type == 'U') {
			const result = await com.verifyWithRestUserId(req, res, null, _logTitle)
			if (!result) return
		}
		const rs = await proc(req)
		res.json(rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router