//used as dedicated worker : debugger, console.log supported (and DOM, anonymous function.. are not supported)
//importScripts("jay_common.js") //jQuery is not defined

//w_winid is unique id for window(tab) which is saved and used in Redis.
//w_winid는 브라우저의 각 윈도우(탭)의 유니크한 ID이며 Redis에도 저장, 사용됨
let w_cnt = 0, w_winid
const SEC = 10

//////////////////////////////////////////start handling IndexedDB
const DATABASE = "jay", TBL = "winner", ONE_KEY = "just_one" //only 1 table & 1 record handled
let db //field(id, winid, udt), protocol(winid, code, msg);

let conn = indexedDB.open(DATABASE, 1) //Increment will trigger conn.onupgradeneeded (add version number if upgrade needed)
conn.onerror = function() {	
    console.log("indexedDB connect error: " + conn.errorCode) 
    postMessage({ code : "idb_conn_err", msg : "indexedDB connect error: " + conn.errorCode })
}
conn.onupgradeneeded = function(e) {
	db = e.target.result //define field
	const os = (db.objectStoreNames.contains(TBL)) ? e.target.transaction.objectStore(TBL) : db.createObjectStore(TBL, { keyPath: "id" }) 			
	if (!os.indexNames.contains("winid")) os.createIndex("winid", "winid", { unique : false })
	if (!os.indexNames.contains("udt")) os.createIndex("udt", "udt", { unique : false })
	os.transaction.oncomplete = function(e) { 
        const _msg = "idb_upgraded"
        console.log(_msg) 
        postMessage({ code : _msg, msg : _msg }) //1.4) 2.4) 2.14) 3.5) Go to jay_main.js
    }
}
conn.onsuccess = function(e) {
    db = conn.result
    const _msg = "idb_connected"
    console.log(_msg) 
    postMessage({ code : _msg, msg : _msg }) //1.4) 2.4) 2.14) 3.5) Go to jay_main.js
}
//////////////////////////////////////////end

onmessage = function(e) {
    if (e.data.code == "auto") {
        if (!e.data.msg) { //1.6) 2.6) e.data.msg=null
            competeWinner() //offline competition. offline 경합. 
        } else {
            w_winid = e.data.msg //2.16) e.data.msg=someValue
            setWinner() //Set new winner from the start since it is StandaloneType. Standalone이므로 경합없이 winner로 설정. 
        }
    } else if (e.data.code == "manual") {
        w_winid = e.data.msg //3.7)
        setWinner() //Set new winner from the start since it is Manual & Standalone Type. Manual & Standalone이므로 경합없이 winner로 설정.
    }
}

function competeWinner() {
    try {
        let isWinner = false
        let udt = getCurDateTimeStr()
        w_winid = w_winid ? w_winid : udt //20200817153202xxx
        udt = udt.substr(0, 14) //20200817153202
        const tx = db.transaction(TBL, "readwrite")
        const os = tx.objectStore(TBL)
        const os_req = os.get(ONE_KEY) //record is only one
        os_req.onsuccess = function(e) {
            const rec = os_req.result //only 1 record returned
            if (!rec) {
                const add_req = os.add({ id : ONE_KEY, winid : w_winid, udt : udt })
                add_req.onsuccess = function() {
                    isWinner = true
                }
                add_req.onerror = function(e) {
                    const _msg = "competeWinner: add_req error: " + e.srcElement.error
                    console.log(_msg)
                    postMessage({ code : "competeWinner_err", msg : _msg })
                }
            } else {
                if (rec.winid == w_winid) {
                    rec.udt = udt
                    const up_req = os.put(rec)
                    up_req.onsuccess = function() {
                        isWinner = true
                    }
                    up_req.onerror = function(e) {
                        const _msg = "competeWinner: up_req error: " + e.srcElement.error
                        console.log(_msg)
                        postMessage({ code : "competeWinner_err", msg : _msg })
                    }
                } else {
                    const _diff = getDateTimeDiff(rec.udt, new Date())
                    if (_diff > (SEC * 2)) {
                        rec.winid = w_winid //Old w_winid가 업데이트 안되는 미사용분이므로 점유함. If old w_winid is not being updated, new w_winid is replaced.
                        rec.udt = udt
                        const up_req1 = os.put(rec)
                        up_req1.onsuccess = function() {
                            isWinner = true
                        }
                        up_req1.onerror = function(e) {
                            const _msg = "competeWinner: up_req1 error: " + e.srcElement.error
                            console.log(_msg)
                            postMessage({ code : "competeWinner_err", msg : _msg })
                        }
                    }
                }			
            }
        }
        os_req.onerror = function(e) {
            const _msg = "competeWinner: os_req error: " + e.srcElement.error
            console.log(_msg)
            postMessage({ code : "competeWinner_err", msg : _msg })
        }
        tx.oncomplete = function() {
            if (isWinner) { //1.7) 2.7) Go to jay_main.js
                postMessage({ code : "winner", msg : "competeWinner: checking as winner: " + w_cnt, winid : w_winid })
            } else {
                postMessage({ code : "0", msg : "competeWinner: competing to be winner: " + w_cnt, winid : w_winid })
            }  	
            w_cnt += 1
            setTimeout(function() { competeWinner() }, SEC * 1000)            
        }  
    } catch (ex) {
        console.log(ex.toString()) 
        postMessage({ code : "competeWinner_err", msg : ex.message })
        return
    }
    
}

function setWinner() {
    try {
        let udt = getCurDateTimeStr()
        udt = udt.substr(0, 14) //20200817153202
        const tx = db.transaction(TBL, "readwrite")
        const os = tx.objectStore(TBL)
        const os_req = os.get(ONE_KEY) //record is only one
        os_req.onsuccess = function(e) {
            const rec = os_req.result //only 1 record returned
            if (!rec) {
                const add_req = os.add({ id : ONE_KEY, winid : w_winid, udt : udt })
                add_req.onerror = function(e) {
                    const _msg = "setWinner: add_req error: " + e.srcElement.error
                    console.log(_msg)
                    postMessage({ code : "setWinner_err", msg : _msg })
                }
            } else {
                rec.winid = w_winid
                rec.udt = udt
                const up_req = os.put(rec)
                up_req.onerror = function(e) {
                    const _msg = "setWinner: up_req error: " + e.srcElement.error
                    console.log(_msg)
                    postMessage({ code : "setWinner_err", msg : _msg })
                }
            }
        }
        os_req.onerror = function(e) {
            const _msg = "setWinner: os_req error: " + e.srcElement.error
            console.log(_msg)
            postMessage({ code : "setWinner_err", msg : _msg })
        }
        tx.oncomplete = function() { //2.17) 3.8)
            postMessage({ code : "winner", msg : "setWinner: checking as winner: " + w_cnt, winid : w_winid })
            w_cnt += 1
            setTimeout(function() { competeWinner() }, SEC * 1000) //not setWinner()
        }  
    } catch (ex) {
        console.log(ex.toString()) 
        postMessage({ code : "setWinner_err", msg : ex.message })
        return
    }
    
}

function getCurDateTimeStr() {
    const now = new Date()
    return now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, "0") + now.getDate().toString().padStart(2, "0") + 
            now.getHours().toString().padStart(2, "0") + now.getMinutes().toString().padStart(2, "0") + now.getSeconds().toString().padStart(2, "0") +
            now.getMilliseconds().toString()
}

function getTimeStamp(str) { //str = 2012-08-02 14:12:04
    var d = str.match(/\d+/g) //extract date parts
    return new Date(d[0], d[1] - 1, d[2], d[3], d[4], d[5]);
}

function getDateTimeDiff(_prev, _now) {
    const udt = _prev.substr(0, 4) + "-" + _prev.substr(4, 2) + "-" + _prev.substr(6, 2) + " " + _prev.substr(8, 2) + ":" + _prev.substr(10, 2) + ":" + _prev.substr(12, 2)
    var dtPrev = getTimeStamp(udt)
    return parseInt((_now - dtPrev) / 1000) //return seconds
}