const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const crypto = require('crypto')
const tracer = require('tracer')
const url = require('url')
const express = require('express')
const requestIp = require('request-ip')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const os = require('os-utils')

module.exports = (function() {
	
	let ws = {
	
		cons : {
			 RESULT_OK : '0',
			 RESULT_ERR : '-1',
			 WARN_NOT_EXIST : '-100',
			 MSG_NOT_EXIST : ' not exists.',
			 MSG_NO_DATA : 'no data.',
			 WARN_PASSWORD_NEEDED : '-76',
			 WARN_PASSKEY_NEEDED : '-77',
			 WARN_PASSWORD_NOT_MATCHED : '-78',
			 WARN_PASSKEY_NOT_MATCHED : '-79',
			 WARN_TOKEN_NEEDED : '-81', //jwt 
			 WARN_TOKEN_MISMATCH : '-82', //jwt payload not equal to decoded
			 WARN_USERID_MISMATCH : '-83',
			 WARN_TOKEN_EXPIRED : '-84',
			 WARN_USE_ONLY_OWN_USERID : '-85'
		},
		
		log : {
			setLogTracer : (logPathObj, projDir) => { //validLogLevel : ['error', 'warn', 'info', 'debug', 'trace'],
				const logTracer = tracer.dailyfile({
					root : logPathObj.logPath, //{ logPath: _obj.logPath } or error occurred
					maxLogFiles : 10, 
					stackIndex : 1, //detecting original source
					allLogsFileName : projDir,
					format : '{{timestamp}} {{message}} (in {{file}}:{{line}})', //format : '{{timestamp}} [{{title}}][{{method}}] {{message}} (in {{file}}:{{line}})',		
					dateformat : 'yyyy-mm-dd HH:MM:ss',
					level : 'info', //default is [2] info. It's impossible to change loglevel dynamically when initial loglevel is higher.
					transport : [
						function(data) { console.log(data.output) } //,function(data) { if (mailNotification) mailNotification('error', data); }
					]
				})
				return logTracer
			},
			ex : (req, ex, _logTitle, _desc) => { //express only (req)
				try {
					let logStr = ''
					if (_logTitle) logStr = _logTitle
					if (req) {
						if (req.clientIp) logStr += ' [' + req.clientIp + ']'
						if (req.jwt && req.jwt.userid) logStr += ' [' + req.jwt.userid + ']'
						logStr += (_desc) ? ' [' + _desc + ']' : ' [' + req.cookies.userid + ']' //req.cookies.userid might be undefined (like when login time)
					} else {
						if (_desc) logStr += ' [' + _desc + ']'
					}
					if (ex.stack) {
						logStr += ' => ' + ex.stack
					} else {
						logStr += ' => ' + ex.message
					}					
					global.log.error(logStr)
				} catch (ex1) {
					console.log('log.error: ' + ex1.stack)
				}
			}	
		},

		token : {
			makeJwt : (payload, _key) => {
				const key = _key || global.nodeConfig.jwt.key
				return jwt.sign(payload, key, { algorithm : global.nodeConfig.jwt.algo, expiresIn : global.nodeConfig.jwt.expiry })
			},
			verifyJwt : (token, userid, _key) => {
				return new Promise((resolve, reject) => {
					try {
						const key = _key || global.nodeConfig.jwt.key					
						let rs = ws.web.rsInit()
						if (!token) {
							rs.code = ws.cons.WARN_TOKEN_NEEDED
							rs.msg = 'Token needed.'
							resolve(rs)
							return
						}
						if (!userid) {
							rs.code = ws.cons.WARN_TOKEN_NEEDED
							rs.msg = 'Userid needed.'
							resolve(rs)
							return
						}
						const _arr = token.split('.')
						const _payloadStr = Buffer.from(_arr[1], 'base64').toString('utf-8')
						jwt.verify(token, key, function(err, decoded) { 
							if (err) {
								if (err.message.includes('jwt expired')) {
									rs.code = ws.cons.WARN_TOKEN_EXPIRED
									rs.msg = 'Token expired.'
								} else {
									rs.code = ws.cons.RESULT_ERR
									rs.msg = err.message
								}
								resolve(rs)
								return
							}
							const decodedStr = JSON.stringify(decoded)
							if (decodedStr != _payloadStr) {
								rs.code = ws.cons.WARN_TOKEN_MISMATCH
								rs.msg = 'Token mismatch.'
								resolve(rs)
								return
							}
							if (decoded.userid != userid) {
								rs.code = ws.cons.WARN_USERID_MISMATCH
								rs.msg = 'Userid not matched with token.'
								resolve(rs)
								return
							}
							rs.token = decoded
							resolve(rs)
						})						
					} catch (ex) {
						reject(ex)
					}
				})
			}
		},

		util : {
			readNodeConfig : (_path) => { //when loading app.js
				let path
				if (!_path) {
					const defaultPath = process.env.WISE_NODE_CONFIG
					if (!defaultPath) return null //NO NODE_CONFIG //ex) c:/config/nodeconfig.json
					path = defaultPath
				} else {
					path = _path
				}
				const rawData = fs.readFileSync(path)
				const data = JSON.parse(rawData)
				return data
			},
			addGlobal : (_obj, nodeConfig) => { // { logPath: 'xxx', dirName: __dirname }
				if (nodeConfig) global.nodeConfig = nodeConfig
				global.projDir = ws.util.getLastItemFromStr(_obj.dirName, path.sep)
				global.log = ws.log.setLogTracer({ logPath: _obj.logPath }, global.projDir)
				console.log('version', process.version)
				console.log('projDir', global.projDir, _obj.dirName)
				console.log('logPath', _obj.logPath)
			},
			initExpressApp : (public) => {
				const _app = express()
				_app.use(requestIp.mw()) //req.clientIp => X-Forwarded-For header info in AWS checked (req.headers['x-forwarded-for'] || req.connection.remoteAddress)
				_app.use(bodyParser.json()) //app.use(express.json())
				_app.use(bodyParser.urlencoded({ extended: true })) //req.body : { array : { key1 : { key2 : '123' } } } //when false => req.body : { 'array[key1][key2]' :'123' }
				_app.use(cookieParser())
				if (public) _app.use(express.static(public))
				return _app
			},
			createWas : (_app, _kind) => {
				let server
				if (_kind == 'https') { //watch out for expiry date.
					const sslOption = { key: fs.readFileSync(nodeConfig.ssl.key, 'utf-8'), cert: fs.readFileSync(nodeConfig.ssl.cert, 'utf-8') }
					server = https.Server(sslOption, _app)
				} else {
					server = http.Server(_app)
				}
				server.keepAliveTimeout = 120000
				return server
			},
			watchProcessError : () => {
				process.on('error', e => {
					global.log.error('process.on error..', e.stack)
				}).on('uncaughtException', e => { //Error:read ECONNRESET => events.js:183 throw er; //Unhandled 'error' event~ 
					global.log.error('process.on uncaughtException..', e.stack)
				}).on('unhandledRejection', (reason, p) => {
					global.log.error(reason, 'process.on unhandled rejection at promise..', p)
				})
			},
			osMem : () => {
				return { totalMem : os.totalmem(), freeMem : os.freemem(), rateMem : os.freememPercentage() }
			},
			encrypt : (text, key) => { //key = 32bytes
				const iv = crypto.randomBytes(16)
				let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv)
				let encrypted = cipher.update(text)
				encrypted = Buffer.concat([encrypted, cipher.final()])
				return iv.toString('hex') + ':' + encrypted.toString('hex')
			}, 
			decrypt : (text, key) => { 				
				let arr = text.split(':')
				let iv = Buffer.from(arr[0], 'hex')
				let encryptedText = Buffer.from(arr[1], 'hex')
				let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv) //const decode = crypto.createDecipher('aes-256-cbc', key). createDecipher deprecated
				let decrypted = decipher.update(encryptedText)
				decrypted = Buffer.concat([decrypted, decipher.final()])
				return decrypted.toString()
			},
			getCurDateTimeStr : (deli) => {
				const now = new Date()
				if (deli) {
					return now.getFullYear().toString() + "-" + (now.getMonth() + 1).toString().padStart(2, "0") + "-" + now.getDate().toString().padStart(2, "0") + " " + 
						now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0") + ":" + now.getSeconds().toString().padStart(2, "0")
				} else {
					return now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, "0") + now.getDate().toString().padStart(2, "0") + 
						now.getHours().toString().padStart(2, "0") + now.getMinutes().toString().padStart(2, "0") + now.getSeconds().toString().padStart(2, "0")
				}
			},
			getTimeStamp : (str) => { //str(2012-08-02 14:12:04) to Date()
				const d = str.match(/\d+/g) //extracts date parts
				return new Date(d[0], d[1] - 1, d[2], d[3], d[4], d[5])
			},
			getDateTimeDiff : (_prev, _now) => { //_prev(2012-08-02 14:12:04)
				const dtPrev = ws.util.getTimeStamp(_prev)
				return parseInt((_now - dtPrev) / 1000) //return seconds
			},
			setDateAdd : (date, days) => {
				let _date = date
				const _days = (Number.isInteger(days)) ? days : parseInt(days)
				_date.setDate(_date.getDate() + _days)
				const year = _date.getFullYear()
				const month = (_date.getMonth() + 1).toString().padStart(2, "0")
				const day = _date.getDate().toString().padStart(2, "0")
				const _dateString = year + '-' + month + '-' + day
				return _dateString
			},
			setHourAdd : (dt, hours) => { //eg)72hours=60*60*1000*72=259,200,000
				let _dt = dt
				const _hours = (Number.isInteger(hours)) ? hours : parseInt(hours)
				_dt.setTime(_dt.getTime() + (_hours * 60 * 60 * 1000)) //Suppose that server set to UTC 
				const year = _dt.getFullYear()
				const month = (_dt.getMonth() + 1).toString().padStart(2, "0")
				const day = _dt.getDate().toString().padStart(2, "0")
				const hour = _dt.getHours().toString().padStart(2, "0")
				const minute = _dt.getMinutes().toString().padStart(2, "0")
				const second = _dt.getSeconds().toString().padStart(2, "0")
				const _dtString = year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second
				return _dtString
			},
			getRnd : (_min, _max) => {
                min = (!_min) ? 100000 : _min
                max = (!_max) ? 999999 : _max
                return Math.floor(Math.random() * (max - min)) + min //return min(inclusive) ~ max(exclusive) Integer only 
			},
			getFileNameAndExtension : (fileStr) => {
				const obj = { }
				const arr = fileStr.split('.')
				obj.name = arr[0]
				if (arr.length == 1) {
					obj.ext = ''
					obj.extDot = ''	
				} else {
					obj.ext = arr[arr.length - 1]
					obj.extDot = '.' + arr[arr.length - 1]
				}
				return obj
			},
			getLastItemFromStr : (_arg, _deli) => {
				if (typeof _arg != 'string') return null
				const _items = _arg.split(_deli)
				return _items[_items.length - 1]
			},
			chkEmoji : (str) => { //https://dev.to/melvin2016/how-to-check-if-a-string-contains-emojis-in-javascript-31pe
				if (/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/gi.test(str)) return true
				return false
			},
			chkShouldEmoji : (str) => {
				if (str.includes(':')) return true
				return false
			},
			utf8StrByteLength : function(s, b, i, c) { //https://programmingsummaries.tistory.com/239
                for (b = i = 0; i < s.length; i++) {
                    c = s.charCodeAt(i)
                    b += c >> 11 ? 3 : c >> 7 ? 2 : 1
                }
                return b
            },
		},

		web : {
			rsInit : () => {
				return { code : ws.cons.RESULT_OK, msg : '', list : [ ] }
			},
			resError : (res, code, msg, title) => {
				res.type('application/json')
				const _msg = (title) ? title + ' : ' + msg : msg
				res.json({ code : code, msg : _msg })
			},
			getQueryStringWithNoCache : (req, paramKey) => { //no decodeURIComponent/encodeURIComponent
				const obj = url.parse(req.url)
				let qsStr = ''
				if (obj.search && obj.search.startsWith('?')) {
					const _qs = obj.search.replace('?', '')
					if (_qs) {
						const _arr = _qs.split('&')
						for (let i = 0; i < _arr.length; i++) {
							const _deli = (qsStr == '') ? '?' : '&'
							const _brr = _arr[i].split('=')
							if (_brr.length > 1) {
								if (_brr[0] != paramKey) qsStr += _deli + _brr[0] + '=' + _brr[1]
							} else {
								qsStr += _deli + _brr[0]
							}
						}
					}
				}
				qsStr += (!qsStr ? '?' : '&') + paramKey + '=' + ws.util.getRnd()
				return qsStr
			}
		}

	}

	return ws

})()
