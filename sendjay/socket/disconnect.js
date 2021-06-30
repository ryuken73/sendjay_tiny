const config = require('../config')
const com = require('../common')
//normal reason   : 1. server namespace disconnect (from server) 
//                  2. client namespace disconnect (from client) 
//                  3. transport close (browser's page closed)
//abnormal reason : 1. ping timeout
//                  2. transport error

module.exports = async function(socket, reason) {	
	const _logTitle = com.cons.sock_ev_disconnect
	try { //userkey made to null when prevsocket disconnect
		if (socket.userkey) {
			//socket.prev is set to true when pmessage for previous socket to kill.
			//That is to prevent sock_ev_show_off occuring later than sock_ev_show_on which looks like turned-off.
			//이전 소켓을 끊으려고 하는 pmessage에서 socket.prev=true로 주는데 sock_ev_show_off가 sock_ev_show_on보다 늦게 처리되어 on/off가 off로 보이는 걸 막기 위함.
			if (!socket.prev) com.broadcast(socket, com.cons.sock_ev_show_off, socket.userkey, 'all')
			await com.multiDelForUserkeySocket(socket)
			//com.procWarn(null, socket, _logTitle, socket.userkey + ', ' + socket.winid + ', ' + socket.id + ', ' + reason)
		}
	} catch (ex) {
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex)
	}
}
