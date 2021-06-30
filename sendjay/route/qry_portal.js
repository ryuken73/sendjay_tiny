const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const express = require('express')
const router = express.Router()
const emoji = require('node-emoji')
//security level (high) : User can access only one's own data.

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			let rs = ws.web.rsInit()
			conn = await wsmysql.getConnFromPool(global.pool)
			const dateFr = ws.util.setDateAdd(new Date(), com.cons.max_days_to_fetch)
			const _type = req.query.type
			const _userid = req.cookies.userid
			const _keyword = decodeURIComponent(req.query.keyword) || ''
			const _roomid = req.query.roomid			
			const _dt = req.query.dt
			const _cnt = parseInt(req.query.cnt)
			const subqry = "(SELECT CDT FROM " + com.tbl.msgdtl + " WHERE ROOMID = A.ROOMID AND RECEIVERID = '" + _userid + "' AND STATE IN ('', 'R') ORDER BY CDT DESC LIMIT 1) "
			let qry = "SELECT ROOMID, ROOMNM, MASTERID, MASTERNM, MEMCNT, MAINNM, NOTI, STATE, NICKNM, LASTMSG, LASTDT "
			qry += "	 FROM ("
			qry += "   SELECT A.ROOMID, A.ROOMNM, A.MASTERID, A.MASTERNM, A.MEMCNT, A.NICKNM MAINNM, B.NOTI, B.STATE, B.NICKNM, "
			qry += "		  (SELECT CONCAT(TYPE, '" + com.cons.subdeli + "', BODY) "
			qry += "		     FROM " + com.tbl.msgmst + " WHERE MSGID = (SELECT MSGID FROM " + com.tbl.msgdtl + " "
			qry += "		     								             WHERE ROOMID = A.ROOMID AND RECEIVERID = '" + _userid + "' AND STATE IN ('', 'R') " 
			qry += "		     								             ORDER BY CDT DESC LIMIT 1)) LASTMSG, "
			qry += "		  IF(" + subqry + " IS NULL, (SELECT CDT FROM " + com.tbl.msgmst + " WHERE ROOMID = A.ROOMID ORDER BY CDT DESC LIMIT 1), " + subqry + ") LASTDT " //Consider in case all mesaages deleted since it's order is important.
			qry += "     FROM " + com.tbl.roommst + " A, " + com.tbl.roomdtl + " B "
			qry += "    WHERE A.ROOMID = B.ROOMID "
			if (_type == 'search') {
				qry += "  AND B.USERID = '" + _userid + "' AND B.STATE = '' "
				qry += "  AND (A.ROOMNM LIKE '%" + _keyword + "%' OR A.NICKNM LIKE '%" + _keyword + "%' OR B.NICKNM LIKE '%" + _keyword + "%')) Z "
				qry += "WHERE LASTDT >= '" + dateFr + "' "
				qry += "ORDER BY LASTDT DESC "
			} else if (_type == 'row') { //for refreshing specific room info
				qry += "  AND A.ROOMID = '" + _roomid + "' "
				qry += "  AND B.USERID = '" + _userid + "' AND B.STATE = '') Z "
			} else { //normal (endless scrolling) or reconnect
				qry += "  AND B.USERID = '" + _userid + "' AND B.STATE = '') Z "
				qry += "WHERE LASTDT >= '" + dateFr + "' AND LASTDT < '" + _dt + "' "
				qry += "ORDER BY LASTDT DESC LIMIT 0, " + _cnt
			}
			const data = await wsmysql.query(conn, qry, null)
			const len = data.length
			if (len == 0) {
				rs.code = ws.cons.WARN_NOT_EXIST
				rs.msg = ws.cons.MSG_NO_DATA
			} else {
				for (let i = 0; i < len; i++) {
					if (data[i].LASTMSG && data[i].LASTMSG.startsWith('talk' + com.cons.subdeli) && ws.util.chkShouldEmoji(data[i].LASTMSG)) {
						data[i].LASTMSG = emoji.emojify(data[i].LASTMSG)
					}
				}
				rs.list = data
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
	const _logTitle = 'qry_portal.router.get'
	try {
		const result = await com.verifyWithRestUserId(req, res, null, _logTitle)
		if (!result) return
		const rs = await proc(req)
		res.json(rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router