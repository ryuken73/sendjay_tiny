const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const fs = require('fs')
const mime = require('mime')
const express = require('express')
const router = express.Router()
//security level (high) : User can access only one's own data.
//For now, 1) Image downloading 2) Checking sending failure

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			const msgid = req.query.msgid
			const body = req.query.body
			const kind = req.query.kind //concerned with IndexedDb
			const msgids = req.query.msgids //concerned with IndexedDb
			let rs = ws.web.rsInit()
			rs.buffer = null
			conn = await wsmysql.getConnFromPool(global.pool)
			if (kind == 'check') {
				const _arr = []
				for (let _msgid of msgids) {
					const qry = "SELECT COUNT(*) CNT FROM " + com.tbl.msgmst + " WHERE MSGID = ? "
					const data = await wsmysql.query(conn, qry, [_msgid])
					if (data[0].CNT == 0) _arr.push(_msgid) //sending failure
				}
				rs.list = _arr
				resolve(rs)
			} else {
				let qry = "SELECT TYPE, BUFFER, BODY FROM " + com.tbl.msgmst + " WHERE MSGID = ? "
				const data = await wsmysql.query(conn, qry, [msgid])
				if (data.length == 0) {
					rs.code = ws.cons.WARN_NOT_EXIST
					rs.msg = 'Msgid' + ws.cons.MSG_NOT_EXIST
					resolve(rs)
				}
				if (data[0].TYPE == 'image') {
					const ret = await com.chkAccessUserWithTarget(req.cookies.userid, msgid, '')
					if (ret != '') throw new Error(ret)
					rs.buffer = data[0].BUFFER //rs.bufferStr = (data[0].BUFFER) ? Buffer.from(data[0].BUFFER, 'binary').toString('base64') : null
					resolve(rs)
				} else if (data[0].TYPE == 'file' || data[0].TYPE == 'flink') { //almost same as get_sublink.js 
					let fileToProc
					const _fileStr = body.split(com.cons.deli)
					const objFileStr = ws.util.getFileNameAndExtension(_fileStr[0])
					if (com.cons.sublink_ext_video.includes(objFileStr.ext)) {
						fileToProc = _fileStr[0] + com.cons.sublink_result_img
					} else if (com.cons.sublink_ext_image.includes(objFileStr.ext)) {
						fileToProc = _fileStr[0]
					} else {
						resolve(rs)
					}
					const ret = await com.chkAccessUserWithTarget(req.cookies.userid, msgid, 'file', _fileStr[0])
					if (ret != '') throw new Error(ret)
					const _filepath = config.app.uploadPath + '/' + fileToProc
					fs.stat(_filepath, function(err, stat) {
						if (err) {
							resolve(rs)
						}
						if (stat && stat.isFile() && stat.size <= com.cons.max_size_to_sublink) { 
							fs.readFile(_filepath, function(err1, data) {
								if (err1) {
								} else {
									rs.buffer = data //rs.bufferStr = Buffer.from(data, 'binary').toString('base64')
								}
								resolve(rs)
							})
						} else {
							resolve(rs)
						}
					})
				} else {
					resolve(rs)
				}
			}
		} catch (ex) {
			reject(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	})
}

router.get('/', async (req, res) => {
	const _logTitle = 'get_msginfo.router.get'
	try {
		const result = await com.verifyWithRestUserId(req, res, null, _logTitle)
		if (!result) return
		const rs = await proc(req)
		if (req.query.type == 'imagetofile') {
			const filename = com.cons.title + '_' + req.query.suffix + com.cons.sublink_result_img //same as mobile app (file download for webview)
			const buf = Buffer.from(new Uint8Array(rs.buffer))
			const filePath = config.app.uploadPath + '/' + filename
			const writer = fs.createWriteStream(filePath)
			writer.write(buf)
			writer.end()
			writer.on("finish", () => { 
				const mimetype = mime.getType(filename)
				res.setHeader('Content-type', mimetype)
				res.download(filePath, filename, (err) => { //res.setHeader('Content-disposition', 'attachment; filename=' + filename)
					if (err) ws.log.ex(req, err, _logTitle)
					fs.unlink(filePath, () => { })
				})
			})
		} else {
			res.json(rs)
		}
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router