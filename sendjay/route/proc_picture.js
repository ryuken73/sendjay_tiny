const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const express = require('express')
const multer  = require('multer')
const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })
//security level (high) : User can access only one's own data.

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			conn = await wsmysql.getConnFromPool(global.pool)			
			let rs = ws.web.rsInit()
			if (req.query.type == 'R') {
				const qry = "SELECT PICTURE, MIMETYPE FROM " + com.tbl.user + " WHERE USER_ID = ? "
				const data = await wsmysql.query(conn, qry, [req.query.userid])
				if (data.length == 0) throw new Error(ws.cons.MSG_NO_DATA)
				rs.picture = data[0].PICTURE //rs.picture = data[0].PICTURE ? Buffer.from(data[0].PICTURE, 'binary').toString('base64') : null
				rs.mimetype = data[0].MIMETYPE
			} else { //watch out for MySQl Error => ER_NET_PACKET_TOO_LARGE: Got a packet bigger than 'max_allowed_packet' btyes
				const buf = (req.body.type == 'U') ? Buffer.from(new Uint8Array(req.files[0].buffer)) : null //null when req.body.type == 'D'
				const uqry = "UPDATE " + com.tbl.user + " SET PICTURE = ?, MIMETYPE = ?, MODR = ?, MODDT = sysdate(6) WHERE USER_ID = ? AND DEL_DATE = '' "
				await wsmysql.query(conn, uqry, [buf, req.body.mimetype, req.body.userid, req.body.userid])
			}			
			resolve(rs)
		} catch (ex) {
			reject(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	})
}

router.post('/', upload.any(), async (req, res) => {
	const _logTitle = 'proc_picture.router.post'
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

router.get('/', async (req, res) => {
	const _logTitle = 'proc_picture.router.get'
	try {
		const rs = await proc(req)
		res.json(rs) //res.setHeader('Content-type', "image/png; charset=utf-8")
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router