const config = require('../config')
const nodeConfig = require(config.app.nodeConfig)
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const fs = require('fs')

ws.util.addGlobal({ logPath: config.app.logPath, dirName: __dirname }, nodeConfig)
global.pool = wsmysql.createPool(config.mysql.scheme)

const TITLE = 'daemon01'
console.log('starting daemon: ' + TITLE)

proc()

async function proc() {
    let conn
    try {
        conn = await wsmysql.getConnFromPool(global.pool)
        await wsmysql.txBegin(conn) //1) delete files to be expired 
        const sql = "SELECT MSGID, ROOMID, BODY FROM " + com.tbl.msgmst + " WHERE TYPE in ('file', 'flink') AND FILESTATE < sysdate() AND FILESTATE <> '" + com.cons.file_expired + "' "
        const data = await wsmysql.query(conn, sql, null)
        const _len = data.length
        for (let i = 0; i < _len; i++) {
            const _msgid = data[i].MSGID
            const _roomid = data[i].ROOMID
            const _body = data[i].BODY
            const _filename = _body.split(com.cons.deli)[0]
            const _path = config.app.uploadPath + '/' + _filename
            await wsmysql.query(conn, "UPDATE " + com.tbl.msgmst + " SET FILESTATE = ? WHERE MSGID = ? AND ROOMID = ? ", [com.cons.file_expired, _msgid, _roomid]) 
            deleteFileAndRemoveEmptyFolderFromChild(_path, _filename, 'expiry')
        } //2) remove garbage files (when browser closing, when aborted ..)
        const sql1 = "SELECT MSGID, ROOMID, SENDERID, BODY FROM " + com.tbl.filelog + " WHERE UDT = '' AND CDT < DATE_ADD(sysdate(), INTERVAL -24 HOUR) "
        const data1 = await wsmysql.query(conn, sql1, null)
        const _len1 = data1.length
        for (let i = 0; i < _len1; i++) {
            const _msgid = data1[i].MSGID
            const _roomid = data1[i].ROOMID
            const _senderid= data1[i].SENDERID
            const _filename = data1[i].BODY
            const _path = config.app.uploadPath + '/' + _roomid + '/' + _senderid + "/" + _filename
            const sql2 = "SELECT COUNT(*) CNT FROM " + com.tbl.msgmst + " WHERE MSGID = ? AND ROOMID = ? AND BODY LIKE '%" + _filename + "%' "
            const data2 = await wsmysql.query(conn, sql2, [_msgid, _roomid])
            await wsmysql.query(conn, "UPDATE " + com.tbl.filelog + " SET UDT = sysdate() WHERE MSGID = ? AND ROOMID = ? ", [_msgid, _roomid]) 
            if (data2[0].CNT == 1) continue //no garbage 
            deleteFileAndRemoveEmptyFolderFromChild(_path, _filename, 'garbage')
        }
        await wsmysql.txCommit(conn)
    } catch (ex) {
        global.log.error(TITLE + ': error: ', ex.stack)
        if (conn) await wsmysql.txRollback(conn)
    } finally {
        try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
        setTimeout(() => { proc() }, 1000 * 60 * 10) //10 minutes
    }
}

function deleteFileAndRemoveEmptyFolderFromChild(_path, _filename, type) {
    try {
        const stat = fs.statSync(_path)
        if (stat && stat.isFile()) { //console.log(TITLE + ': ' + type + ': ' + _path)
            fs.unlinkSync(_path)
            const pathObj = ws.util.getFileNameAndExtension(_path)
            if (com.cons.sublink_ext_video.includes(pathObj.ext)) { //related with ffmpeg (streaming)
                try {
                    const imgPath = _path + com.cons.sublink_result_img
                    const stat = fs.statSync(imgPath)
                    if (stat && stat.isFile()) fs.unlinkSync(imgPath)
                } catch (ex2) { //Almost => Error: ENOENT: no such file or directory => it's ok to be ignored
                    const _msg = ex2.message.includes('ENOENT') ? 'not found' : ex2.message
                    console.log(TITLE + ': error2: ' + type + ': ' + imgPath + ': ' + _msg)        
                }
            } 
            const arr = _filename.split('/')
            const brr = []
            for (let i = 0; i < arr.length - 1; i++) { //(arr.length - 1) is filename
                if (i == 0) {
                    brr.push(arr[i])
                } else {
                    brr.push(brr.join('/') + '/' + arr[i])
                }
            }
            for (let j = brr.length - 1; j >= 0; j--) { //remove empty folder from child
                const files = fs.readdirSync(config.app.uploadPath + '/' + brr[j])
                if (!files.length) fs.rmdirSync(config.app.uploadPath + '/' + brr[j])
            }
        }
    } catch (ex) { //Almost => Error: ENOENT: no such file or directory => it's ok to be ignored
        const _msg = ex.message.includes('ENOENT') ? 'not found' : ex.message
        console.log(TITLE + ': error1: ' + type + ': ' + _path + ': ' + _msg)
    }
}

ws.util.watchProcessError()
