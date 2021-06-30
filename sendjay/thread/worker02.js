const config = require('../config')
const nodeConfig = require(config.app.nodeConfig)
const ws = require(config.app.ws)
const { parentPort } = require('worker_threads')
//port80, 81 (both of servers)

ws.util.addGlobal({ logPath: config.app.logPath, dirName: __dirname }, nodeConfig)

const TITLE = 'worker02'
console.log('starting thread: ' + TITLE)

proc()
async function proc() {
    try {
        parentPort.postMessage({ ev : 'chk_sockets_rooms' })
    } catch (ex) {
        global.log.error(TITLE + ': error: ', ex.stack)
    } finally {
        setTimeout(() => { proc() }, 1000 * 60) //1 minute
    }
}

ws.util.watchProcessError()