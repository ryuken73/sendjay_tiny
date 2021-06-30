const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const express = require('express')
const router = express.Router()
//security level (low) : Every user can access all data without verifying token.

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			let rs = ws.web.rsInit()
			conn = await wsmysql.getConnFromPool(global.pool)
			const _keyword = decodeURIComponent(req.query.keyword) || ''
			let qry
			qry = "SELECT ORG_CD, ORG_NM, LVL, (SELECT COUNT(*) FROM " + com.tbl.user + " WHERE ORG_CD = A.ORG_CD AND DEL_DATE = '') MEMCNT FROM " + com.tbl.org + " A "		
			if (_keyword) qry += "WHERE ORG_CD = '" + _keyword + "' "
			qry += "ORDER BY SEQ "
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
	const _logTitle = 'qry_orgtree.router.get'
	try {
		const rs = await proc(req)
		res.json(rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle, req.query.uid)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router