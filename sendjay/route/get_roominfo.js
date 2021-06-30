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
			const _userid = req.cookies.userid
			const _roomid = req.query.roomid			
			let qry = "SELECT A.NICKNM MAINNM, B.NICKNM NICKNM, A.ROOMNM, B.NOTI "
			qry += "     FROM " + com.tbl.roommst + " A, " + com.tbl.roomdtl + " B "
			qry += "    WHERE A.ROOMID = B.ROOMID "
			qry += "  	  AND A.ROOMID = '" + _roomid + "' AND B.USERID = '" + _userid + "' "
			const data = await wsmysql.query(conn, qry, null)
			if (data.length == 0) {
				rs.code = ws.cons.WARN_NOT_EXIST
				rs.msg = ws.cons.MSG_NO_DATA
			} else {
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
	const _logTitle = 'get_roominfo.router.get'
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