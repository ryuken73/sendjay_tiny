const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const fs = require('fs-extra') //not fs
const url = require('url')
const mime = require('mime')
const express = require('express')
const multer  = require('multer')
const ffmpeg = require('fluent-ffmpeg')
const router = express.Router()
//security level (high) : User can access only one's own data.
//File should be requested one by one

const procScreenShot = (req, filename, filepath, filedir) => {
	return new Promise(async (resolve, reject) => {
		try {			
			const new_filename = filename + com.cons.sublink_result_img
			const ffMpeg = new ffmpeg({ source: filepath, nolog: true })
			ffMpeg.setFfmpegPath(config.app.ffmpeg)
			ffMpeg.takeScreenshots({ timemarks : ['00:00:03.000'], size : '320x320', filename : new_filename }, filedir)
			.on('error', function(err) {
				console.log('ffmpeg error : ' + err + ' ==> ' + filepath)
				resolve()
			}).on('end', function() {
				if (filename.endsWith(com.cons.sublink_ext_video)) {
					ffmpeg.ffprobe(filepath, function(err, metadata) { //You can remove this coding if performance issue exists
						if (err) {
							resolve()
						} else {					
							resolve(metadata) //metadata should contain 'width', 'height' and 'display_aspect_ratio'
						}
					})
				} else {
					resolve()
				}
			})
		} catch (ex) {
			ws.log.ex(req, ex, 'procScreenShot', filepath)
			resolve()
		}
	})
}

const upload = multer({ storage: multer.diskStorage({ //order : destination -> filename (all the time regardless coding position)
	destination : async function(req, file, cb) {
		let _dir_room, _dir
		try {
			_dir_room = config.app.uploadPath + '/' + req.body.roomid
			_dir = _dir_room + '/' + req.body.senderid
			if (_dir.includes('undefined')) {
				const errStr = '_dir undefined - ' + _dir
				ws.log.ex(req, errStr, 'upload-multer', file.originalname)
				cb(errStr)
			}
			await fs.ensureDir(_dir_room) //It's possible that empty dir occurrs.
			await fs.ensureDir(_dir) //It's possible that empty dir occurrs.
			cb(null, _dir)
		} catch (err) {
			ws.log.ex(req, err, 'destination', _dir)
			cb(err)
		}
	},
	filename : async function(req, file, cb) { //file={"fieldname":"file","originalname":"제목 없음.png","encoding":"7bit","mimetype":"image/png"} : no file size here
		let conn
		try {
			const fileStrObj = ws.util.getFileNameAndExtension(file.originalname) //file size => req.body.body
			req.filename = fileStrObj.name + com.cons.subdeli + ws.util.getCurDateTimeStr() + ws.util.getRnd() + fileStrObj.extDot
			conn = await wsmysql.getConnFromPool(global.pool)
			const role = await com.getRole(req.cookies.userid, conn)
			if (!com.chkRole(role, com.cons.group_ay) && !com.chkRole(role, com.cons.group_main)) {
				if (req.body.body > com.cons.max_filesize) throw new Error('File size exceeded. (max:' + com.cons.max_filesize + ', yours:' + req.body.body + ')')
				const sql = "SELECT COUNT(*) CNT FROM " + com.tbl.msgmst + " WHERE TYPE = 'file' AND FILESTATE >= sysdate() AND FILESTATE <> ? AND SENDERID = ? "
				const data = await wsmysql.query(conn, sql, [com.cons.file_expired, req.body.senderid])
				if (data[0].CNT >= com.cons.max_filecount) throw new Error('Uploading quota is up to ' + com.cons.max_filecount + ' files which are not expired(deleted by deamon) yet.')
			}
			let iqry = "INSERT INTO " + com.tbl.filelog + " (MSGID, ROOMID, SENDERID, BODY, CDT) VALUES (?, ?, ?, ?, sysdate(6)) "
			await wsmysql.query(conn, iqry, [req.body.msgid, req.body.roomid, req.body.senderid, req.filename])
			cb(null, req.filename)
		} catch (ex) {
			ws.log.ex(req, ex, 'filename', req.filename)
			cb(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	}
})})

const procMulter = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {	
			let rs = ws.web.rsInit()
			let expiry = ws.util.setHourAdd(new Date(), com.cons.max_hours_to_filesave) //ws.util.setDateAdd(new Date(), com.cons.max_days_to_filesave)
			const ridArr = req.body.receiverid.split(com.cons.easydeli)
			const rnmArr = req.body.receivernm.split(com.cons.easydeli)
			const filedir = config.app.uploadPath + '/' + req.body.roomid + '/' + req.body.senderid
			const filepath = filedir + '/' + req.filename
			let fileInfo = filepath + com.cons.deli + req.body.body //req.file.filename
			fileInfo = fileInfo.replace(config.app.uploadPath + '/', '') //hide parent folder for file upload
			conn = await wsmysql.getConnFromPool(global.pool)			
			await wsmysql.txBegin(conn)
			let iqry = "INSERT INTO " + com.tbl.msgmst + " (MSGID, ROOMID, SENDERID, SENDERNM, BODY, REPLY, TYPE, FILESTATE, CDT) VALUES (?, ?, ?, ?, ?, ?, ?, ?, sysdate(6)) "
			await wsmysql.query(conn, iqry, [req.body.msgid, req.body.roomid, req.body.senderid, req.body.sendernm, fileInfo, req.body.reply, req.body.type, expiry])
			const _len = ridArr.length
			for (let i = 0; i < _len; i++) {
				iqry = "INSERT INTO " + com.tbl.msgdtl + " (MSGID, ROOMID, SENDERID, RECEIVERID, RECEIVERNM, CDT) VALUES (?, ?, ?, ?, ?, sysdate(6)) "
				await wsmysql.query(conn, iqry, [req.body.msgid, req.body.roomid, req.body.senderid, ridArr[i], rnmArr[i]])
			}
			const objFileStr = ws.util.getFileNameAndExtension(req.filename)
			if (com.cons.sublink_ext_video.includes(objFileStr.ext)) {
				const meta = await procScreenShot(req, req.filename, filepath, filedir)
				if (meta) {
					const _added = com.cons.deli + meta.streams[0].width + com.cons.deli + meta.streams[0].height 
					const uqry = "UPDATE " + com.tbl.msgmst + " SET BODY = CONCAT(BODY, ?) WHERE MSGID = ? AND ROOMID = ? "
					await wsmysql.query(conn, uqry, [_added, req.body.msgid, req.body.roomid])
				}
			}
			await wsmysql.txCommit(conn)
			resolve(rs)
		} catch (ex) {
			await wsmysql.txRollback(conn)
			reject(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	})
}

router.post('/', (req, res) => { //router.post('/', upload.single('file'), async (req, res) => {
	const _logTitle = 'proc_file.router.post'
	upload.single('file')(req, res, async (err) => { //order : upload(destination) -> upload(filename) -> procMulter()
		try {
			if (err) throw new Error(err.toString())
			const result = await com.verifyWithRestUserId(req, res, req.body.senderid, _logTitle)
			if (!result) return
			const rs = await procMulter(req)
			res.json(rs)
		} catch (ex) {
			ws.log.ex(req, ex, _logTitle)
			ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
		}
	})
})

router.get('/*', async (req, res) => { //asterisk(*) needed
	const _logTitle = 'proc_file.router.get'
	try {	
		const result = await com.verifyWithRestUserId(req, res, null, _logTitle)
		if (!result) return
		let _path = url.parse(req.url).pathname.replace('/proc_file/', '')
		_path = decodeURIComponent(_path)
		const _idx = _path.indexOf('?')
		if (_idx > -1) _path = _path.substr(0, _idx)
		const ret = await com.chkAccessUserWithTarget(req.cookies.userid, req.query.msgid, "file", _path) //console.log(_path+"==="+req.cookies.userid+"$$$")
		if (ret != "") throw new Error(ret)
		const _filename = config.app.uploadPath + _path //_path starts with roomid
		const mimetype = mime.getType(_filename) //mimetype = mime.lookup(_filename)
		res.setHeader('Content-type', mimetype) //res.header("Content-Type", "video/mp4; charset=utf-8")
		//console.log(_logTitle, mimetype, _filename)
		res.download(_filename) //res.download('C:/nodeops/upload/sendjay_tiny/20210214124957779000571393Q59__OES0F/1/aaa.png') //res.download(_filename)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}	
})

module.exports = router