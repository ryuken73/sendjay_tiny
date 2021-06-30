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
			let rs = ws.web.rsInit()
			const buf = Buffer.from(new Uint8Array(req.files[0].buffer))
			const ridArr = req.body.receiverid.split(com.cons.easydeli)
			const rnmArr = req.body.receivernm.split(com.cons.easydeli)
			conn = await wsmysql.getConnFromPool(global.pool)
			await wsmysql.txBegin(conn)
			let iqry = "INSERT INTO " + com.tbl.msgmst + " (MSGID, ROOMID, SENDERID, SENDERNM, BUFFER, REPLY, TYPE, CDT) VALUES (?, ?, ?, ?, ?, ?, ?, sysdate(6)) "
			await wsmysql.query(conn, iqry, [req.body.msgid, req.body.roomid, req.body.senderid, req.body.sendernm, buf, req.body.reply, req.body.type])
			const _len = ridArr.length
			for (let i = 0; i < _len; i++) {
				iqry = "INSERT INTO " + com.tbl.msgdtl + " (MSGID, ROOMID, SENDERID, RECEIVERID, RECEIVERNM, CDT) VALUES (?, ?, ?, ?, ?, sysdate(6)) "
				await wsmysql.query(conn, iqry, [req.body.msgid, req.body.roomid, req.body.senderid, ridArr[i], rnmArr[i]])
			}
			await wsmysql.txCommit(conn)
			resolve(rs)
		} catch (ex) {
			if (conn) await wsmysql.txRollback(conn)
			reject(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	})
}

router.post('/', upload.any(), async (req, res) => {
	const _logTitle = 'proc_image.router.post'
	try {
		const result = await com.verifyWithRestUserId(req, res, req.body.senderid, _logTitle)
		if (!result) return
		const rs = await proc(req)
		res.json(rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router