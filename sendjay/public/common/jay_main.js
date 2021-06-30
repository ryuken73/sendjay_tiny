//jay_main.js should be imported to 1) your portal page (for embedding web messenger) and 2) index.html (for standalone)

var g_memWin, g_token10, g_userkey, g_userid, g_usernm, g_orgcd, g_useridArr, g_unread = {}

let g_mode, g_mode_people, g_win_type, g_setting = {}
let g_list, g_page, g_cdt, g_searchmode, g_year, g_lastdt_for_toprow //g_lastdt_for_toprow = for mobil only
let prevType = "", g_setting_changed = false
let nodeIndent, portalListBeingQueried = false

const BTN_MODE_PEOPLE = "btn_people", BTN_MODE_CHAT = "btn_chat" //should be same as button id
const BTN_PEOPLE_TEAM = "btn_team", BTN_PEOPLE_COMPANY = "btn_company" //should be same as button id
const FIRST_QUERIED = "9999"
const runFromStandalone = location.pathname.startsWith(hush.cons.app) ? true : false //false means embeded talk

const resetEnvForScroll = () => {
    g_searchmode = false
    g_cdt = FIRST_QUERIED //FIRST_QUERIED(default). YYYYMMDD~ : when scrolled all the way down to the bottom, previous page shown and g_cdt gets YYYYMMDD~ value
    if ($("#spn_unread").css("display") != "none") handleDocTitle(-1, runFromStandalone)
}

const procScrollEvent = () => {            
    resetEnvForScroll()
    g_list.scroll(function() { //endless scroll
        const getMore = $("#getmore")
        if (!getMore || getMore.length == 0 || g_searchmode) return
        if (getMore.position().top <= g_list.height()) { //g_list position should be relative for checking position().top
            if (getMore.attr("getting") == "Y") return
            getMore.attr("getting", "Y")
            setTimeout(() => getPortalList({ type: "normal" }), 100)
        }
    })
}

const procMenuTop = async (_mode, _mode_people) => {
    try {
        g_mode = (_mode) ? _mode : BTN_MODE_PEOPLE
        $(".coNav").removeClass("coNavSelected")
        $(".coMenuBtn").hide()
        if (g_mode == BTN_MODE_PEOPLE) {
            $("#fr_menu_top").css("display", "flex")
            $("#fr_people").css("display", "flex")
            $("#fr_chat").hide()
            $("#fr_setting").hide()
            if (g_win_type == "org" || g_win_type == "org_web") { //popup to select orgcd from user_manage.html (pc web or mobile web not app)
                toggleForBtnCompany(true)
                $(".setting").show()
                $("#in_search").hide()
                $("#btn_search").hide()
                getOrgTree({ keyword : "", withMember : false, expand : 99 })
            } else {
                if (g_win_type == "invite" || g_win_type == "member") {
                    $(".setting").show()
                } else {
                    $(".people").show()
                }
                if (_mode_people) {
                    procMenuPeople(_mode_people, true)
                } else {
                    procMenuPeople(hush.http.getCookie("mode_people"))
                }
            }
        } else if (g_mode == BTN_MODE_CHAT) {
            $("#fr_menu_top").css("display", "flex")
            toggleForBtnCompany(false)
            $("#fr_people").hide()
            $("#fr_chat").css("display", "flex")
            $("#fr_setting").hide()
            $(".chat").show()
            resetEnvForScroll()
            getPortalList({ type: "normal" })
        } else { //btn_setting
            $("#fr_menu_top").hide()
            $("#fr_people").hide()
            $("#fr_chat").hide()
            $("#fr_setting").css("display", "flex")
            $(".setting").show()
            const rs = await hush.auth.verifyLogin()
            if (rs.code == hush.cons.result_ok) procSetting("load", rs, true)
        }
        $("#" + g_mode).addClass("coNavSelected")
        $("#fr_menu_bottom").css("display", "flex")
        if (!_mode_people) hush.http.setCookie("mode", g_mode, true)
    } catch (ex) {
        hush.msg.alert("procMenuTop: " + ex.message)
    }
}

const procMenuPeople = (_mode, popup) => {
    try {
        $("#in_search").val("")
        g_mode_people = (_mode) ? _mode : BTN_PEOPLE_TEAM
        if (g_mode_people == BTN_PEOPLE_TEAM) {
            getMembers("orgcd", g_orgcd)
            toggleForBtnCompany(false)
        } else { //BTN_PEOPLE_COMPANY
            getOrgTree({ keyword : "", withMember : true, expand : 0 })
            toggleForBtnCompany(true)
        }
        if (!popup) hush.http.setCookie("mode_people", g_mode_people, true)
    } catch (ex) {
        hush.msg.alert("procMenuPeople: " + ex.message)
    }
}

const toggleForBtnCompany = (show) => {
    if (show) {
        if (!hush.webview.on) {
            $("#btn_collapseall").show()
            $("#btn_expandall").show()
        }
        if (!g_win_type) { 
            $("#chk_selectall").css("visibility", "hidden")
        } else {
            $("#chk_selectall").hide()
        }
    } else {
        if (!hush.webview.on) {
            $("#btn_collapseall").hide()
            $("#btn_expandall").hide()
        }
        if (!g_win_type) { 
            $("#chk_selectall").css("visibility", "visible")
        } else {
            $("#chk_selectall").show()
        }        
    }
    $("#chk_selectall").prop("checked", false)
}

const procMemPanel = () => {
    const _cnt = $(".mem").length
    $("#selected_people_cnt").html(_cnt)
    if (_cnt > 0) {
        $("#selected_people").css("display", "flex")
    } else {
        $("#selected_people").hide()
    }            
}

const procSelect = (_userid) => {
    try {
        const _list = $("#select_people_sub")
        const tag = $("#sel_" + _userid)
        const _chk = tag.is(":checked")
        if (_chk) {
            if ($("#add_" + _userid).length > 0) {
                $("#add_" + _userid).effect("highlight", { color: hush.cons.fadein }, 500)
                return
            }
            const _nm = $("#nm_" + _userid).html()
            const _team = $("#team_" + _userid).html()
            let _html = "<div id=add_" + _userid + " class=mem>"
            _html += "      <div id=addnm_" + _userid + " class='coDotDot memNm'>" + _nm + "</div>"
            if (_team) _html += "  <div class='coDotDot memTeam'>" + _team + "</div>"
            _html += "   </div>"
            _list.append(_html)
            _list.scrollTop(_list.prop("scrollHeight"))
            const _useridTag = $("#add_" + _userid)
            _useridTag.effect("highlight", { color: hush.cons.fadein }, 100)
            _useridTag.off("click").on("click", function() {
                $(this).remove()
                $("#sel_" + _userid).prop("checked", false)
                procMemPanel()                                
            })
            _useridTag.off("mouseover").on("mouseover", function() { $(this).addClass("memSel") })
            _useridTag.off("mouseleave").on("mouseleave", function() { $(this).removeClass("memSel") })
            procMemPanel()
        } else {
            const _useridTag = $("#add_" + _userid)
            hush.util.animAction(_useridTag, () => { 
                _useridTag.remove()
                procMemPanel()
            })
        }
    } catch (ex) {
        hush.msg.alert("procSelect: " + ex.message)
    }
}

const procSearch = () => {
    const keyword = $("#in_search").val().trim()
    if (keyword.length == 0) {
        hush.msg.toast(hush.cons.msg.blank_requested)
        return
    } 
    if (g_mode === BTN_MODE_PEOPLE) {
        $("#btn_collapseall").hide()
        $("#btn_expandall").hide()
        getMembers("search", keyword)
    } else {			
        getPortalList({ type: "search", keyword : keyword})
    }
    setTimeout(() => $("#in_search").blur(), 500)
}

const getMembers = async (type, keyword, tag) => { //group or search. (userids used in chat.html also)
    try {
        let _tag = tag
        const list = $("#list_people")
        let _attr = "", paddingLeft = 10, marginLeft = 0
        if (tag) { //concerned with getOrgTree() below
            _attr = "tagid=" + tag[0].id + " dispstate=flex"
            const _level = parseInt($("#" + tag[0].id).attr("level"))
            paddingLeft += (_level + 1) * nodeIndent
            marginLeft = 10
        } else {
            list.empty()
        }
        let rq = { type : type, keyword : encodeURIComponent(keyword) }
        const rs = await hush.http.ajax(hush.cons.route + "/qry_userlist", rq)
        if (rs.code != hush.cons.result_ok) {
            hush.msg.toast(rs.msg)
            return false
        }
        let userkeyArr = [ ]
        const _len = rs.list.length
        for (let i = 0; i < _len; i++) {
            const row = rs.list[i]
            const _userid = row.USER_ID
            const w_userkey = hush.cons.w_key + _userid
            const m_userkey = hush.cons.m_key + _userid
            const _nm = row.USER_NM
            const _tel = row.TEL_NO
            const _job = row.JOB
            const _org = row.ORG_NM + " / " + row.TOP_ORG_NM
            const _abcd = row.AB_CD
            const _abnm = row.AB_NM
            const _nicknm = row.NICK_NM
            const push_ios = row.PUSH_IOS
            const push_and = row.PUSH_AND
            const state_mob = (push_ios && push_ios != hush.cons.invalid_push_token) || (push_and && push_and != hush.cons.invalid_push_token) ? "coStateMob mobInstalled" : "coStateOff"
            let disp_nick = "display:none", disp_abcd = "display:none", disp_abnm = "display:none"
            if (_nicknm && !_abcd && !_abnm) disp_nick = ""
            if (_abcd) disp_abcd = ""    
            if (_abnm && !hush.webview.on) disp_abnm = ""   
            const disp_org = (type == "search" && !hush.webview.on) ? "" : "display:none" 
            let disp_job
            if (_job && type == "search") {
                disp_job = (hush.webview.on) ? "color:#005192" : "color:#005192;margin-left:10px"
            } else {
                disp_job = (_job) ? "" : "display:none"
            }
            let disp_second, valign_first
            if (disp_job == "display:none" && disp_org == "display:none") {
                disp_second = "flex-grow:0;display:none"
                valign_first = "center"
            } else {
                disp_second = "flex-grow:1;display:flex"
                valign_first = "flex-end"
            }
            let _html = "<div id=mem_" + _userid + " " + _attr + " style='height:50px;display:flex;align-items:center;cursor:default;border-bottom:1px solid lightgray;overflow:hidden;padding-left:" + paddingLeft + "px'>"
            _html += "      <input type=checkbox id=sel_" + _userid + " class=chkbox_people style='visibility:hidden;margin-left:" + marginLeft + "px' />"
            _html += "      <img id=img_" + _userid + " src='" + hush.cons.img_noperson + "' class=coImg32 style='border-radius:5px;margin-left:8px' />"
            _html += "      <div id=per_" + _userid + " style='flex:1;min-width:0;height:100%;display:flex;flex-direction:column;cursor:pointer;margin-left:10px'>" //flex:1;min-width:0 used instead of width:calc(100% - 300px)
            _html += "          <div id=first_" + _userid + " style='flex-grow:1;display:flex;align-items:" + valign_first +";overflow:hidden;margin:2px 0px'>"
            _html += "              <span id=w_" + w_userkey + " class='state coStateOff'>W</span>"
            _html += "              <span id=m_" + m_userkey + " class='state " + state_mob + "' style='margin-left:5px'>M</span>"
            _html += "              <span id=nm_" + _userid + " class=coDotDot style='min-width:55px;color:#005192;font-weight:bold;margin-left:5px'>" + _nm + "</span>"
            _html += "              <span id=nick_" + _userid + " class=coDotDot style='" + disp_nick + ";margin-left:10px'>[" + _nicknm + "]</span>"
            _html += "              <span id=abcd_" + _userid + " class=coStateOut style='" + disp_abcd + ";margin-left:10px'>" + _abcd + "</span>"
            _html += "              <span id=abnm_" + _userid + " class=coDotDot style='" + disp_abnm + ";margin-left:5px'>" + _abnm + "</span>"
            _html += "         </div>"
            _html += "          <div id=second_" + _userid + " style='" + disp_second + ";align-items:flex-start;overflow:hidden;margin:2px 0px'>"
            _html += "              <span id=team_" + _userid + " class=coDotDot style='" + disp_org + "'>" + _org + "</span>"
            _html += "              <span id=job_" + _userid + " class=coDotDot style='" + disp_job + ";color:darkgray'>" + _job + "</span>"
            _html += "         </div>"
            _html += "      </div>"
            _html += "   </div>"
            if (_tag) {
                _tag.after(_html) //Just using tag not _tag causes ascending order to descending one.
                _tag = $("#mem_" + _userid)
            } else {
                list.append(_html)
            }
            userkeyArr.push(w_userkey)
            userkeyArr.push(m_userkey)
            hush.http.getUserPic(_userid, "img_" + _userid)
            $("#per_" + _userid).off("click").on("click", function() {
                hush.msg.alert("Name: " + _nm + "<br><br>Phone: <a href=tel:'" + _tel + "'>" + _tel + "</a><br>Org: " + _org + "<br>Job: " + _job + "<br><br>" + _abcd + " " + _abnm, null, "Info")
            })
        }
        if (_len == 0) return false          
        $(".chkbox_people").off("change").on("change", function() {
            const _userid = this.id.substring(4)
            procSelect(_userid)
        })  
        $(".chkbox_people").css("visibility", "visible")
        sendChkAliveSimple(userkeyArr)
        return true
    } catch (ex) {
       hush.msg.alert("getMembers: " + ex.message)
    }
}

const sendChkAliveSimple = (userkeyArr) => {
    const dataObj = { userkeys : userkeyArr }
    if (hush.webview.ios) {
    } else if (hush.webview.and) {
        AndroidCom.send(hush.cons.sock_ev_chk_alive_simple, JSON.stringify(dataObj), null, null, false) //procMsg=false
    } else {
        if (g_win_type == "invite") { //from chat.html
            hush.sock.send(opener.opener.hush.socket, hush.cons.sock_ev_chk_alive_simple, dataObj, opener.g_roomid)
        } else if (g_win_type == "member") { //from index.html (popup)
            hush.sock.send(opener.hush.socket, hush.cons.sock_ev_chk_alive_simple, dataObj)
        } else {
            hush.sock.send(hush.socket, hush.cons.sock_ev_chk_alive_simple, dataObj)
        }
    }
}

const getOrgTree = async (obj) => { //eg) const obj = { keyword : "", withMember : false, expand : 1 }
    //1) keyword = orgcd or blank (This is server sql option. Belows are client option)
    //2) withMember = if true, members are downloaded when node clicked (memcnt attribute used for this)
    //   => 'false' supports singleSelect / 'true' supoorts selectMemberOnly (cannot select Org node)
    //3) expand = -1,0,1,2.. (-1 : all collapsed, 1 : depth 0 and 1 expanded, 99 : all expanded )    
    try {
        const list = $("#list_people")
        list.empty()
        let rq = { keyword : encodeURIComponent(obj.keyword) }
        const rs = await hush.http.ajax(hush.cons.route + "/qry_orgtree", rq) //without members
        if (rs.code != hush.cons.result_ok) {
            hush.msg.toast(rs.msg)
            return
        }
        const _len = rs.list.length
        const _objUpperLevel = {} //used for deciding child node's parent tag id
        for (let i = 0; i < _len; i++) {
            const row = rs.list[i]
            const orgcd = row.ORG_CD
            const orgnm = row.ORG_NM
            const level = row.LVL
            const memcnt = (obj.withMember) ? row.MEMCNT : -1 //-1 means no need to download members (when -1, every org node has -1)
            let disp = "", hasChild = "Y", expanded = "", parentid = "", chkDisp = ""
            if (i == _len - 1 || rs.list[i + 1].LVL <= level) hasChild = "N" //if hasChild is "N" then 'expanded' has no effect at all
            if (hush.util.isvoid(obj.expand) || obj.expand < 0) {
                disp = (level == 0) ? "flex" : "none"
                if (hasChild == "Y") expanded = " expanded=N"
            } else if (obj.expand > 99) {
                disp = "flex"
                if (hasChild == "Y") expanded = " expanded=Y"
            } else {
                disp = (level <= obj.expand + 1) ? "flex" : "none"
                if (hasChild == "Y") expanded = (level <= obj.expand) ? " expanded=Y" : " expanded=N"
            }
            if (!obj.withMember && level > 0) {
                chkDisp = ""
            } else {
                if (memcnt >= 2 && expanded.includes("=Y")) { //checkbox shown only if the node has multiple members and expanded for convenience of selecting members
                    chkDisp = ""
                } else {
                    chkDisp = "display:none;"
                }
            }
            if (level > 0 && _objUpperLevel[level - 1]) parentid = _objUpperLevel[level - 1]
            const expcolImg = (expanded.includes("=Y")) ? "gray_minus" : "gray_plus"                    
            const paddingLeft = 10 + level * nodeIndent
            let _html = "<div id=orgrow_" + i + " orgcd=" + orgcd + " dispstate=" + disp + " haschild=" + hasChild + " level=" + level + expanded + " memcnt=" + memcnt
            _html += "      memdownloaded=N parent='" + parentid + "' class=orgrow "
            _html += "      style='height:50px;display:" + disp + ";align-items:center;cursor:pointer;border-bottom:1px solid lightgray;padding-left:" + paddingLeft + "px'>"
            _html += "      <input type=checkbox id=orgsel_" + i + " class=orgsel style='" + chkDisp + "margin-left:10px' />"
            _html += "      <img src='/img/gray_folder.png' class=coImg32 style='margin-left:8px' />"
            _html += "      <div id=orgbody_" + i + " class='coDotDot orgbody' style='flex:1;min-width:0;margin-left:8px'>"                   
            _html += "          <span id=orgnm_" + i + " style='line-height:50px;font-weight:bold'>" + orgnm + "</span>"
            let dispCnt = (memcnt <= 0) ? "" : "(" + memcnt + ")"
            if (g_win_type == "org" || g_win_type == "org_web") { //This line is temporary coding to restrict selecting node (Remove this for your coding)
                const _color = row.MEMCNT >= hush.cons.max_member_for_org ? ";color:red" : ";color:blue" //same as above
                dispCnt = row.MEMCNT > hush.cons.max_member_for_org ? "(" + row.MEMCNT + ") Full of members" : "(" + row.MEMCNT + ")" //same as above
                _html += "      <span style='font-size:12px;margin-left:10px" + _color + "'>" + dispCnt + "</span>" //same as above
            } else { //temporary coding
                _html += "      <span style='font-size:12px;color:darkgray;margin-left:10px'>" + dispCnt + "</span>" //This is original coding.
            } //temporary coding
            _html += "      </div>"
            _html += "      <div style='width:40px;display:flex;align-items:center;justify-content:flex-end;margin-right:8px'>"
            const dispImg = (hasChild == "Y") ? "" : "style='display:none'"
            _html += "          <img id=orgexpcol_" + i + " src='/img/" + expcolImg + ".png' class=coImg32 " + dispImg + " />"
            _html += "      </div>"
            _html += "  </div>"
            list.append(_html)
            _objUpperLevel[level] = "orgrow_" + i
            if (memcnt > 0 && level <= obj.expand) { //if node has child, it downloads members
                const _tag = $("#orgrow_" + i)
                const _done = await getMembers("orgcd", orgcd, _tag)
                if (_done) {
                    _tag.attr("memdownloaded", "Y")
                    _tag.attr("haschild", "Y")
                    procExpCol("N", _tag, i, obj) //N->Y
                }
            }
        }
        if (_len == 0) return
        $(".orgsel").off("change").on("change", function(e) { //e.stopPropagation() not worked since click event is one step ahead change event => changed to .orgbody from .orgrow
            const _self = $(this)
            const _id = this.id //eg) orgsel_2
            const _idx = parseInt(_id.substring(7)) //eg) 2
            const _bool = _self.prop("checked")
            if (obj.withMember) {
                if (_bool) {
                    _self.css("opacity", "0.2")
                } else {
                    _self.css("opacity", "1.0")
                }
                const _memTag = $("div[tagid='orgrow_" + _idx + "']") //see getMembers()  
                $(_memTag).each(function(idx) {
                    const _id = this.id //eg) mem_xxxxxx
                    const _userid = _id.substring(4) //eg) xxxxxx
                    const _selTag = $("#sel_" + _userid)
                    $(_selTag).prop("checked", _bool)
                    procSelect(_userid)
                })
            } else { //singleSelect if not withMember option
                $(".orgsel").prop("checked", false)
                if (_bool) _self.prop("checked", true)
            }
        })
        $(".orgbody").off("click").on("click", async function() {
            const _id = this.id //eg) orgbody_2
            const _idx = parseInt(_id.substring(8)) //eg) 2
            const _tag = $("#orgrow_" + _idx) //eg) orgrow_2
            const _level = parseInt(_tag.attr("level"))
            const _expanded = _tag.attr("expanded") //Y or ~
            const _hasChild = _tag.attr("haschild") //Y or ~
            const _memcnt = parseInt(_tag.attr("memcnt"))
            const _memDownloaded = _tag.attr("memdownloaded") //Y or ~ => withMember option needed
            if (_hasChild == "Y") {
                hush.util.animCall(_id, true)
                const _nextTag = $("#orgrow_" + (_idx + 1))
                const levelNext = (_nextTag || _nextTag.length > 0) ? parseInt(_nextTag.attr("level")) : -1
                if (levelNext == -1 || levelNext <= _level) { //case of last level child
                    procExpCol(_expanded, _tag, _idx, obj)
                } else {
                    let j = 0
                    for (let i = _idx + 1; i < _len; i++) {
                        const _nextTag = $("#orgrow_" + i)
                        const levelNext = parseInt(_nextTag.attr("level"))
                        if (levelNext <= _level) break
                        if (_expanded == "Y") { //if expanded, it should be collapsed (child nodes to hide and save their display state)
                            if (levelNext == _level + 1) {
                                _nextTag.attr("dispstate", "none")
                            } else {
                                _nextTag.attr("dispstate", _nextTag.css("display"))
                            }
                            _nextTag.hide()
                        } else {   
                            if (levelNext == _level + 1) {
                                _nextTag.css("display", "flex")
                                _nextTag.attr("dispstate", "flex")
                            } else {
                                if ($("#" + _nextTag.attr("parent")).css("display") == "none") { //if parent node not displayed, child node should be not displayed too
                                    _nextTag.css("display", "none")
                                } else { //or recall child node's display state
                                    _nextTag.css("display", _nextTag.attr("dispstate"))
                                }
                            }
                        }
                        j += 1
                    }  
                    if (j > 0) procExpCol(_expanded, _tag, _idx, obj)
                }
                if (_memcnt > -1) { //belows are should be processed if _memcnt is 0 (-1 is for withMember option false)
                    for (let i = _idx; i < _len; i++) { //The above is for org node display and below is for member toggle (display or not)
                        const _tag = $("#orgrow_" + i)
                        const _tagLevel = parseInt(_tag.attr("level"))
                        const _memDownloadedTag = (_tag) ? _tag.attr("memdownloaded") : "N"
                        const _memTag = $("div[tagid='" + _tag[0].id + "']") //see getMembers()                          
                        if (i > _idx && _tagLevel <= _level) break
                        if (_memDownloadedTag != "Y") continue
                        if (_expanded == "Y") { //if expanded, it should be collapsed (child nodes to hide and save their display state)
                            if (_tagLevel == _level) {
                                $(_memTag).attr("dispstate", "none")
                            } else {
                                $(_memTag).attr("dispstate", $(_memTag).css("display"))
                            }
                            $(_memTag).hide()
                        } else {
                            if (_tagLevel == _level) {  
                                $(_memTag).css("display", "flex")
                            } else {
                                if ($("#" + _tag.attr("parent")).css("display") == "none") { //if parent node not displayed, child node should be not displayed too
                                    $(_memTag).css("display", "none")
                                } else { //or recall child node's display state
                                    $(_memTag).css("display", $(_memTag).attr("dispstate"))
                                }
                            }
                        }
                    }
                }
            }
            if (_memcnt > 0 && _memDownloaded != "Y" && _expanded != "Y") { //if current node has child, it downloads members when clicked
                const _orgcd = _tag.attr("orgcd")
                const _done = await getMembers("orgcd", _orgcd, _tag)
                if (_done) {
                    _tag.attr("memdownloaded", "Y")
                    _tag.attr("haschild", "Y")
                    procExpCol("N", _tag, _idx, obj) //N->Y
                }
            }
        })
        $("#btn_collapseall").off("click").on("click", function() { 
            const _len = $(".orgrow").length
            for (let i = 0; i < _len; i++) {
                const _tag = $("#orgrow_" + i)
                const _level = parseInt(_tag.attr("level"))
                const _memDownloadedTag = (_tag) ? _tag.attr("memdownloaded") : "N"
                const _memTag = $("div[tagid='" + _tag[0].id + "']") //see getMembers()                            
                if (_tag.attr("haschild") == "Y") procExpCol("Y", _tag, i, obj) //Y->N
                if (_level > 0) {
                    _tag.hide()
                    _tag.attr("dispstate", "none")
                    if (_memDownloadedTag == "Y") { //memdownloaded attribute gets Y when withMember option to true and after downloaded
                        $(_memTag).attr("dispstate", "none")
                        $(_memTag).hide()
                    }
                }
            }
        })
        $("#btn_expandall").off("click").on("click", function() { 
            const _len = $(".orgrow").length
            for (let i = 0; i < _len; i++) {
                const _tag = $("#orgrow_" + i)
                const _memDownloadedTag = (_tag) ? _tag.attr("memdownloaded") : "N"
                const _memTag = $("div[tagid='" + _tag[0].id + "']") //see getMembers()   
                _tag.css("display", "flex")
                _tag.attr("dispstate", "flex")
                if (_tag.attr("haschild") == "Y") procExpCol("N", _tag, i, obj) //N->Y
                if (_memDownloadedTag == "Y") { //memdownloaded attribute gets Y when withMember option to true and after downloaded
                    $(_memTag).attr("dispstate", "flex")
                    $(_memTag).css("display", "flex")
                }
            }
        })
    } catch (ex) {
        hush.msg.alert("getOrgTree: " + ex.message)
    }
}

const procExpCol = (_expanded, _tag, _idx, _obj) => {
    const _tagExpcol = $("#orgexpcol_" + _idx)
    if (_tagExpcol.css("display") == "none") _tagExpcol.show()
    if (_expanded == "Y") {
        _tag.attr("expanded", "N")
        _tagExpcol.attr("src", "/img/gray_plus.png")
    } else {
        _tag.attr("expanded", "Y")
        _tagExpcol.attr("src", "/img/gray_minus.png")
    }
    if (_obj.withMember) {
        if (parseInt(_tag.attr("memcnt")) >= 2 && _tag.attr("expanded") == "Y") {
            $("#orgsel_" + _idx).show()
        } else {
            $("#orgsel_" + _idx).prop("checked", false)
            $("#orgsel_" + _idx).hide()
        }
    }
}

const dispCustom = (body) => {
    const _arr = body.split(hush.cons.subdeli)
    let _msg
    if (_arr.length == 1) {
        _msg = body
    } else {
        _body = body.substring(_arr[0].length + 2) //ex) file$$!
        _msg = hush.util.displayTalkBodyCustom(_arr[0], _body)
    }
    return _msg.replace(/<br>/gi, " ") //ex) ~ <br>invited by ~
}

const getPortalList = async (obj) => {
    try {
        if (portalListBeingQueried) return
        portalListBeingQueried = true
        let rq = { type : obj.type }, withToast = false
        if (obj.type == "search") {
            g_list.empty()
            rq.keyword = encodeURIComponent(obj.keyword)
            withToast = true
        } else if (obj.type == "row") {
            rq.roomid = obj.roomid
        } else if (obj.type == "reconnect") {
            rq.dt = FIRST_QUERIED
            rq.cnt = 1
        } else { //normal (endless scrolling)
            rq.dt = g_cdt
            rq.cnt = hush.cons.fetch_cnt_list //if (g_cdt == FIRST_QUERIED) g_list.empty()
        }
        const rs = await hush.http.ajax(hush.cons.route + "/qry_portal", rq, null, withToast)
        if (rs.code != hush.cons.result_ok && rs.code != hush.cons.result_no_data) {
            hush.msg.toast("getPortalList:: " + rs.msg)
            if ($("#getmore").length > 0) $("#getmore").remove()
            portalListBeingQueried = false
            return
        } //ChatRoom(row) will be placed to the top of list unless obj.replace is true. obj.replace가 true가 아니면 해당 채팅방(row)은 맨 위로 위치함.
        if (obj.type == "reconnect") {
            portalListBeingQueried = false
            if (rs.list.length == 0) return //console.log(rs.list[0].LASTDT + "===" + g_lastdt_for_toprow)
            if (rs.list[0].LASTDT == g_lastdt_for_toprow) return
            procMenuTop(hush.http.getCookie("mode"))
            return
        }
        if (obj.roomid && !obj.replace) $("#div_" + obj.roomid).remove() //ex) obj.replace used for when 'leave' 
        let lastRoomid = ""
        if ($(".div_row").length > 0) lastRoomid = $(".div_row").last()[0].id
        const _len = rs.list.length
        if (_len == 0) {
            if (g_cdt == FIRST_QUERIED) {
                hush.msg.toast(hush.cons.msg.no_data)
            } else {
                $("#getmore").html(hush.cons.msg.no_more_data)
                setTimeout(() => $("#getmore").remove(), 1000)
            }
            portalListBeingQueried = false
            return
        }
        if (obj.type == "search") g_searchmode = true
        if (obj.type == "normal" && g_cdt == FIRST_QUERIED) g_list.empty()
        for (let i = 0; i < _len; i++) {
            const row = rs.list[i]
            const _roomid = row.ROOMID
            const _roomnm = hush.room.getRoomName(row.NICKNM, row.MAINNM, row.ROOMNM)
            const _memcnt = row.MEMCNT
            const _noti = row.NOTI
            hush.room.map[_roomid] = { nm: _roomnm, noti: _noti }
            const _lastmsg = (row.LASTMSG) ? dispCustom(row.LASTMSG) : "No Message"
            g_cdt = row.LASTDT
            if (i == 0) {
                if (obj.type == "normal" || (obj.roomid && !obj.replace)) g_lastdt_for_toprow = row.LASTDT //ex) ignore when member leave
            }
            let _lastdt = (g_cdt) ? hush.util.formatMsgDt(hush.util.tzDateTime(g_cdt), g_year, true) : "" //timezone            
            let _html = "<div id=div_" + _roomid + " class=div_row style='width:100%;height:50px;display:flex;align-items:center;border-bottom:1px solid lightgray'>"
            _html += "      <input type=checkbox id=sel_" + _roomid + " class=chkbox_portal style='margin-left:10px' />"
            _html += "      <div id=subdiv_" + _roomid + " class='row_portal' style='flex:1;min-width:0;height:100%;align-self:stretch;display:flex;flex-direction:column;cursor:pointer;margin:0px 10px'>"
            _html += "          <div style='width:100%;height:50%;display:flex;align-items:flex-end;margin:2px 0px'>"
            _html += "              <div class=coDotDot style='flex:1;min-width:0;color:#005192;font-weight:bold'>" + _roomnm + "</div>"
            _html += "              <div style='width:70px;display:flex;align-items:center;justify-content:flex-end'>"
            const _noti_visible = (_noti == "X") ? "" : "display:none;"
            _html += "                  <img id=alarm_" + _roomid + " src='/img/notify_off_com.png' style='" + _noti_visible + "width:18px;height:18px;vertical-align:middle'/>"
            _html += "                  <span id=unread_" + _roomid + " style='display:none;border-radius:3px;background-color:orange;color:white;font-size:12px;padding:2px 6px;margin-left:10px'></span>"
            _html += "                  <span style='color:darkgray;margin-left:10px'>" + _memcnt + "</span>"
            _html += "              </div>"
            _html += "          </div>"
            _html += "          <div style='width:100%;height:50%;display:flex;align-items:flex-start;margin:2px 0px'>"
            _html += "              <div id=body_" + _roomid + " class=coDotDot style='flex:1;min-width:0;color:darkgray'>" + _lastmsg + "</div>"
            _html += "              <div id=udt_" + _roomid + " style='width:100px;color:darkgray;text-align:right'>" + _lastdt + "</div>"
            _html += "          </div>"
            _html += "      </div>"
            _html += "   </div>"
            if (!obj.roomid) {
                g_list.append(_html)
                if (i == _len - 1 && !g_searchmode) { //endless scroll
                    if ($("#getmore").length > 0) $("#getmore").remove()
                    const _last = $("#div_" + _roomid)
                    if (_last && _last.length > 0) {
                        if (_last.position().top + _last.height() + 1 >= g_list.height()) { //g_list position should be relative for checking position().top. 1 is border.
                            _html = "<div id=getmore style='height:50px;display:flex;align-items:center;justify-content:center;background:steelblue;color:white'>processing..</div>"
                            g_list.append(_html)
                            _last.css("border-bottom", "1px solid steelblue")
                        }
                    }
                }
            } else {
                if (obj.replace) {
                    $("#div_" + obj.roomid).replaceWith(_html)
                } else {
                    g_list.prepend(_html) //To the top of list
                }
            }
            getUnreadPerEachRoom(_roomid, true) //Or you can check unreads at a time by using 'group by roomid' sql in qry_unread.js
        }
        if (obj.type == "normal" && g_cdt != FIRST_QUERIED && lastRoomid != "") hush.util.animCall(lastRoomid, true) //tells if next fetch exists
        const _tag = (obj.roomid) ? "#subdiv_" + obj.roomid : ".row_portal"
        $(_tag).off("click").on("click", function() {
            const _id = this.id
            hush.util.animCall(_id, true)
            const _roomid = _id.substring(7)
            if (hush.webview.ios) {
            } else if (hush.webview.and) {
                AndroidMain.openRoom("open", _roomid, "portal", "") //setTimeout(() => AndroidMain.openRoom("open", _roomid, "portal", ""), 200)
            } else {
                hush.room.open(_roomid, "portal")
            }
        })
        portalListBeingQueried = false
    } catch (ex) {
        portalListBeingQueried = false
        if (obj.type != "reconnect") hush.msg.toast("getPortalList: " + obj.type + ": " + ex.message)
    }
}

const getUnreadPerEachRoom = async (roomid, chkCloseNoti) => { //no unread display in case of invite/leave msg
    try {
        const rs = await hush.http.ajax(hush.cons.route + "/qry_unread", { roomid : roomid })
        const _unread = rs.list[0].UNREAD
        if (_unread == 0) {
            $("#unread_" + roomid).hide() //for positioning problem
            $("#unread_" + roomid).html("0") //for calculation
            if (chkCloseNoti) closeNoti(roomid, null, true)
        } else {
            $("#unread_" + roomid).show()
            $("#unread_" + roomid).html(_unread)
        }
    } catch (ex) {
        //hush.msg.alert("getUnreadPerEachRoom: " + ex.message) //Unable to connect to server.
    }
}

const handleDocTitle = (unreads, runFromStandalone) => {
    const CHECK_UNREADS = " - Check Unreads"
    if (unreads == 1) {
        if (runFromStandalone) {
            $("#spn_unread").show()
            document.title = hush.cons.title + CHECK_UNREADS
        } else {
            document.title += CHECK_UNREADS
        }
        document.getElementById("favicon").setAttribute("href", "/img/unread.png")
    } else if (unreads == 0) {
        if (runFromStandalone) {
            document.title = hush.cons.title
        } else {
            if (document.title.includes(CHECK_UNREADS)) document.title = document.title.replace(CHECK_UNREADS, "")
            document.title += " (with Talk)"
        }       
        document.getElementById("favicon").setAttribute("href", hush.cons.logo_darkblue)
    } else { //-1 (standalone)
        $("#spn_unread").hide()
        document.title = hush.cons.title
        document.getElementById("favicon").setAttribute("href", hush.cons.logo_darkblue)
    }
}

const getUnreadForAll = async () => { //tells if unread exists on load
    try {
        //When LASTCHKDT field is updated in ChatService.kt, unread information will be nothing on pc browser.
        //ChatService.kt에서 먼저 qry_unread로 LASTCHKDT 필드 업데이트하면 PC브라우저에서는 안읽은톡 정보 없는 것으로 나타날 것임 
        const rs = await hush.http.ajax(hush.cons.route + "/qry_unread", null)
        const len = rs.list.length
        if (len == 0) {
            handleDocTitle(0, runFromStandalone)
        } else {
            handleDocTitle(1, runFromStandalone)
            for (let i = 0; i < len; i++) g_unread[rs.list[i].ROOMID] = rs.list[i].UNREAD
        }
    } catch (ex) {
        hush.msg.alert("getUnreadForAll: " + ex.message)
    }
}

const closeNoti = (roomid, msgid, skipGetUnreadPerEachRoom) => {
    if (!hush.webview.on) {
        const noti = hush.noti.notis[roomid]
        if (noti) noti.close()
        procUnreadTitle(roomid)
        if (!skipGetUnreadPerEachRoom) getUnreadPerEachRoom(roomid)
        if (msgid) { //see [hush.cons.sock_ev_read_msg]
            setTimeout(function() {
                const noti = hush.noti.notis[roomid]
                if (noti && noti.msgid && msgid == noti.msgid) {
                    noti.close()
                    procUnreadTitle(roomid)
                    if (!skipGetUnreadPerEachRoom) getUnreadPerEachRoom(roomid)
                }
            }, 3000)        
        }
    } else {
        procUnreadTitle(roomid)
        if (!skipGetUnreadPerEachRoom) getUnreadPerEachRoom(roomid)
    } 
}

const initMsg = (_roomid) => { //differ from chat.html
    const _msgid = hush.util.createId(g_token10)
    const _curdt = hush.util.getCurDateTimeStr(true) //local backup in a sence
    return { msgid : _msgid, senderkey : g_userkey, senderid : g_userid, sendernm : g_usernm, cdt : _curdt, filestate : "", body : "", type : "", reply : "", roomid : _roomid, roomnm : "" }
}

function procNewChatFromPopup(useridArr) { //invoked from index.html (member) popup : Web Only
    if (useridArr.length == 0) return
    g_useridArr = useridArr
    hush.room.create("newFromPopup", g_token10)            
}

const chkTime = (tm) => {
    if (tm == "") return true
    if (tm.length != 4 || parseInt(tm) < 0 || parseInt(tm) > 2400) {
        hush.msg.alert("Time should be between 0000 and 2400.")
        return false
    }
    return true
}

const procSettingOnLoad = (rs) => {
    g_setting.nicknm = (rs.nicknm) ? rs.nicknm : ""
    g_setting.job = (rs.job) ? rs.job : ""
    g_setting.abcd = (rs.abcd) ? rs.abcd : ""
    g_setting.abnm = (rs.abnm) ? rs.abnm : ""
    hush.http.setCookie("standalone", rs.standalone)
    hush.http.setCookie("notioff", rs.notioff)
    hush.http.setCookie("soundoff", rs.soundoff)
    g_setting.fr = (rs.fr) ? rs.fr : ""
    g_setting.to = (rs.to) ? rs.to : ""
    hush.http.setCookie("bodyoff", rs.bodyoff)
    hush.http.setCookie("senderoff", rs.senderoff)
}

const procSetting = async (type, rs, needPicture) => { //type(load,save,cancel)
    try {
        if (type == "load") {
            procSettingOnLoad(rs)
            $("#in_nicknm").val(g_setting.nicknm)
            $("#header_title").html(g_usernm + ((g_setting.nicknm != "") ? " [" + g_setting.nicknm + "]" : ""))
            $("#in_job").val(g_setting.job)
            $("#in_abcd").val(g_setting.abcd)
            $("#in_abnm").val(g_setting.abnm)
            $("#chk_standalone").prop("checked", (rs.standalone == "Y" ? true : false))
            $("#chk_notioff").prop("checked", (rs.notioff == "Y" ? true : false))  
            $("#chk_soundoff").prop("checked", (rs.soundoff == "Y" ? true : false))  
            $("#in_fr").val(g_setting.fr)
            $("#in_to").val(g_setting.to)
            $("#chk_bodyoff").prop("checked", (rs.bodyoff == "Y" ? true : false))
            $("#chk_senderoff").prop("checked", (rs.senderoff == "Y" ? true : false))            
            if (needPicture) {
                if (rs.picture != null) {
                    hush.http.getUserPic(g_userid, "img_pict")
                } else {
                    $("#img_pict").attr("src", hush.cons.img_noperson)
                }
            }
        } else if (type == "save") {
            const _nicknm = $("#in_nicknm").val().trim()
            const _job = $("#in_job").val().trim()
            const _abcd = $("#in_abcd").val().trim()
            const _abnm = $("#in_abnm").val().trim()
            if (!hush.util.chkFieldVal(_nicknm, hush.cons.max_nicknm_len, false, false, "Nick Name")) return
            if (!hush.util.chkFieldVal(_job, 50, false, false, "Job Description")) return
            if (!hush.util.chkFieldVal(_abcd, 7, false, false, "Absence Code")) return
            if (!hush.util.chkFieldVal(_abnm, 50, false, false, "Absence Period")) return    
            const _standalone = $("#chk_standalone").is(":checked") ? "Y" : ""
            const _notioff = $("#chk_notioff").is(":checked") ? "Y" : ""
            const _soundoff = $("#chk_soundoff").is(":checked") ? "Y" : ""
            const _fr = $("#in_fr").val().trim()
            const _to = $("#in_to").val().trim()
            if (!chkTime(_fr)) return
            if (!chkTime(_to)) return
            if ((_fr == "" && _to != "") || (_fr != "" && _to == "")) {
                hush.msg.alert("Both of Noti Time field should be filled.")
                return
            }
            const _bodyoff = $("#chk_bodyoff").is(":checked") ? "Y" : ""                       
            const _senderoff = $("#chk_senderoff").is(":checked") ? "Y" : ""              
            const rq = { nicknm : encodeURIComponent(_nicknm), job : encodeURIComponent(_job), //type : "common", 
                        abcd : encodeURIComponent(_abcd), abnm : encodeURIComponent(_abnm), standalone : _standalone, notioff : _notioff,
                        soundoff : _soundoff, fr : _fr, to : _to, bodyoff : _bodyoff, senderoff : _senderoff }
            const rs = await hush.http.ajax(hush.cons.route + "/proc_env", rq, "POST")
            if (rs.code != hush.cons.result_ok) {
                hush.msg.alert("procSetting: " + rs.msg)
                return false
            }
            $("#header_title").html(g_usernm + ((_nicknm != "") ? " [" + _nicknm + "]" : ""))
            g_setting.nicknm = _nicknm            
            g_setting.job = _job
            g_setting.abcd = _abcd
            g_setting.abnm = _abnm            
            hush.http.setCookie("standalone", _standalone)
            hush.http.setCookie("notioff", _notioff)
            hush.http.setCookie("soundoff", _soundoff)
            g_setting.fr = _fr
            g_setting.to = _to
            hush.http.setCookie("bodyoff", _bodyoff)
            hush.http.setCookie("senderoff", _senderoff)
            const rq1 = { kind : "userinfo", userid : g_userid, userkey : g_userkey, nicknm : _nicknm, job : _job, abcd : _abcd, abnm : _abnm, notioff : _notioff,  
            soundoff : _soundoff, fr : _fr, to : _to, bodyoff : _bodyoff, senderoff : _senderoff }
            if (hush.webview.ios) {
            } else if (hush.webview.and) {
                AndroidCom.send(hush.cons.sock_ev_set_env, JSON.stringify(rq1), "all", null, true) //procMsg=true
            } else {
                hush.sock.send(hush.socket, hush.cons.sock_ev_set_env, rq1, "all")
            }
        } else { //cancel
            $("#in_nicknm").val(g_setting.nicknm)
            $("#in_job").val(g_setting.job)
            $("#in_abcd").val(g_setting.abcd)
            $("#in_abnm").val(g_setting.abnm)  
            $("#chk_standalone").prop("checked", (hush.http.getCookie("standalone") == "Y" ? true : false))
            $("#chk_notioff").prop("checked", (hush.http.getCookie("notioff") == "Y" ? true : false))
            $("#chk_soundoff").prop("checked", (hush.http.getCookie("soundoff") == "Y" ? true : false))
            $("#in_fr").val(g_setting.fr)  
            $("#in_to").val(g_setting.to)
            $("#chk_bodyoff").prop("checked", (hush.http.getCookie("bodyoff") == "Y" ? true : false))
            $("#chk_senderoff").prop("checked", (hush.http.getCookie("senderoff") == "Y" ? true : false))
        }
    } catch (ex) {
        hush.msg.alert("procSetting: " + ex.message)
    }
}

const getRoomInfo = async (roomid) => {
    $("#chk_selectall").prop("checked", false)
    if ($("#div_" + roomid).length > 0) getPortalList({ type: "row", roomid : roomid, replace: true })
}

function OnSearch(input) {
    if (input.value == "") {
        if (g_win_type == "invite" || g_win_type == "member" || g_win_type == "org") {
            procMenuTop(BTN_MODE_PEOPLE, BTN_PEOPLE_COMPANY)
        } else {
            procMenuTop(hush.http.getCookie("mode"))
        }
    }
    setTimeout(() => $("#in_search").blur(), 500)
}

var procUnreadTitle = (roomid) => { //call from chat.html
    //Displaying as "unread" at document.title handles unread count before messenger starts not after messenger start.
    //document.title에 안읽은톡 표시는 메신저가 시작하기 전까지 안읽은 톡 갯수만 다루고 시작 이후의 톡은 대상으로 하지 않음.
    if (!$.isEmptyObject(g_unread)) {
        delete g_unread[roomid]
        if ($.isEmptyObject(g_unread)) handleDocTitle(false, runFromStandalone)
    }
}

var funcSockEv = { //needs to be public
    [hush.cons.sock_ev_chk_alive_simple] : (data) => { //[...]
        for (let item of data) hush.people.toggleDisplay(item, true)
        if (g_memWin && !g_memWin.closed) g_memWin.funcSockEv[hush.cons.sock_ev_chk_alive_simple].call(null, data)
    },
    [hush.cons.sock_ev_show_off] : (userkey) => { //Client does not explicly send data but server does to clients (see disconnect.js)
        hush.people.toggleDisplay(userkey, false) //클라이언트가 명시적으로 보내지 않고 서버 disconnect.js에서 보냄
        if (g_memWin && !g_memWin.closed) g_memWin.funcSockEv[hush.cons.sock_ev_show_off].call(null, userkey)
    },
    [hush.cons.sock_ev_show_on] : (userkey) => { //Client does not explicly send data but server does to clients (see app.js)
        hush.people.toggleDisplay(userkey, true) //클라이언트가 명시적으로 보내지 않고 서버 app.js에서 보냄
        if (g_memWin && !g_memWin.closed) g_memWin.funcSockEv[hush.cons.sock_ev_show_on].call(null, userkey) 
    },
    [hush.cons.sock_ev_send_msg] : (data) => {
        try {
            if (data.type == "leave") {
                if (!runFromStandalone) return
                const who = data.reply ? data.reply : data.senderid //data.reply = make someone leave. 강제퇴장
                if (who == g_userid) {
                    $("#div_" + data.roomid).remove()
                    if (!hush.webview.on) {
                        const _win = hush.sock.rooms[data.roomid]
                        if (_win && !_win.closed) {
                            _win.close()
                            delete hush.sock.rooms[data.roomid]
                        }
                    }
                } else {
                    getPortalList({ type: "row", roomid : data.roomid, replace: true })
                }
            } else {
                const _win = hush.sock.rooms[data.roomid]
                if (_win && !_win.closed) {
                    if (!_win.document.hasFocus()) hush.noti.procNoti(data.roomid, data)
                } else {
                    hush.noti.procNoti(data.roomid, data)
                }
                if (!runFromStandalone) return
                getPortalList({ type: "row", roomid : data.roomid })
            }
        } catch (ex) {
            hush.msg.alert("[main]sock_ev_send_msg: " + ex.message)
        }
    },
    [hush.cons.sock_ev_read_msg] : (data) => {        
        if (data.receiverid != g_userid) return
        $("#chk_selectall").prop("checked", false)
        $(".chkbox_portal:checked").prop("checked", false)
        if (data.type == "updateall") { //socket.emit for both Desktop/Mobile
            const objUnread = $("#unread_" + data.roomid)
            objUnread.hide()
            objUnread.html("0")
        }
        if (data.type == "update") {
            closeNoti(data.roomid, data.msgid)
        } else {
            closeNoti(data.roomid)
        }
    },
    [hush.cons.sock_ev_rename_room] : (data) => {
        getRoomInfo(data.roomid)
    },
    [hush.cons.sock_ev_delete_msg] : (data) => {
        getRoomInfo(data.roomid)
    },
    [hush.cons.sock_ev_revoke_msgcell] : (data) => {
        getRoomInfo(data.roomid)
    },
    [hush.cons.sock_ev_set_env] : async (data) => {
        if (data.kind == "noti") { //emit
            getRoomInfo(data.roomid)
        } else if (data.kind == "userinfo") { //broadcast inside namespace
            if (data.userid == g_userid && data.userkey != g_userkey) {
                const rs = await hush.auth.verifyLogin()
                if (rs.code == hush.cons.result_ok) procSetting("load", rs)
            }
            const _nicknm = data.nicknm ? "[" + data.nicknm + "]" : ""
            $("#nick_" + data.userid).html(_nicknm)
            $("#job_" + data.userid).html(data.job)
            $("#abcd_" + data.userid).html(data.abcd)
            $("#abnm_" + data.userid).html(data.abnm)
            if (data.abcd || data.abnm) {
                $("#nick_" + data.userid).hide()
                $("#abcd_" + data.userid).show()
                $("#abnm_" + data.userid).show()
            } else {
                $("#nick_" + data.userid).show()
                $("#abcd_" + data.userid).hide()
                $("#abnm_" + data.userid).hide()
            }
            hush.room.getAllRoomsOpen((win) => {
                const _tag = $("#abcd_" + data.userid, win.document)
                _tag.html(data.abcd)
                if (data.abcd) {
                    _tag.show()
                } else {
                    _tag.hide()
                }
            })
        }          
    },
    [hush.cons.sock_ev_open_room] : (data) => {
        if (data.from != "before_leave") return //see $("#btn_exit") in index.html
        const rq = initMsg(data.roomid)
        rq.type = "leave"
        rq.body = g_usernm + hush.cons.left
        if (hush.webview.ios) { 
        } else if (hush.webview.and) {
            AndroidCom.send(hush.cons.sock_ev_send_msg, JSON.stringify(rq), data.roomid, "parent", true) //procMsg=false 
        } else {
            hush.sock.send(hush.socket, hush.cons.sock_ev_send_msg, rq, data.roomid, "parent")
        }
    },
    [hush.cons.sock_ev_cut_mobile] : (data) => {
        hush.msg.alert("Logout done. (including mobile device)")
    },
    [hush.cons.sock_ev_disconnect] : (data) => { //mobile only
        $("#img_disconn").show() //hush.msg.toast("disconnected", false, true)
    },
    [hush.cons.sock_ev_mark_as_connect] : (data) => {//mobile only
        $("#img_disconn").hide() //hush.msg.toastEnd()
    },
    [hush.cons.sock_ev_connect] : (data) => { //mobile only (reconnect event in actual)
        //Be careful that Socket.EVENT_CONNECT occurred many times at a moment. => from ChatService.kt
        $("#img_disconn").hide() //hush.msg.toastEnd()
        if (g_mode == BTN_MODE_PEOPLE) {
            const userkeyArr = []
            $(".state").each(function(idx, item) {
                userkeyArr.push(this.id.substring(2))
            }).promise().done(function() {
                sendChkAliveSimple(userkeyArr)
            })
        } else if (g_mode == BTN_MODE_CHAT) {
            getPortalList({ type: "reconnect" }) //procMenuTop(hush.http.getCookie("mode"))
        }
        AndroidCom.reconnectDone()
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//initMain() is Shared in 1. erp_portal.html (for embeding) and 2. /public/jay/index.html (for standalone). Fully tested in chrome only.
//initMain() arguments : launch(auto/manual), winid(value/undefined)
//Messenger has 3 LaunchMode : 1.Auto Launch with Embeded Type 2. Auto Launch with Standalone Type 3. Manual(Button) Launch with Standalone Type

//1. Auto Launch with Embeded Type : initMain(launch=auto)
//   Executed in background mode with portal page and nofify message arrival. 
//   사내포털페이지(탭)에 임베디드되어 Background로 실행됨. 메시지 도착시 알려 주는 역할을 담당. 
//   1) erp_portal.html -> 2)3) initMain() in jay_main.js -> 4) jay_worker.html ->
//   5) initMain() in jay_main.js -> 6),7) in jay_wroker.js -> 8),9) initMain() in jay_main.js -> socket connection

//2. Auto Launch with Standalone Type : initMain(launch=auto) : same as above till 9)
//   When autolaunch competition, all are winid=undefined whether EmbededType or StandaloneType.
//   AutoLaunch 경합시에는 Embeded Type이든 Standalone Type이든 모두 winid=undefined. 
//   1) erp_portal.html -> 2)3) initMain() in jay_main.js -> 4) jay_worker.html ->
//   5) initMain() in jay_main.js -> 6),7) in jay_wroker.js -> 8),9) initMain() in jay_main.js ->
//   10) window.open("/jay?launch=auto&winid=" + e.data.winid) : initMain(launch=auto, winid=someValue)
//   11) /public/jay/index.html -> 12),13) initMain() in jay_main.js -> 14) in jay_wroker.js -> 
//   15) initMain() in jay_main.js -> 16),17) in jay_wroker.js -> 18),19) initMain() in jay_main.js (socket connection)

//3. Manual Launch (Standalone Type) : initMain(launch=manual, winid=someValue)
//   1) button press in erp_portal.html -> 2) /public/jay/index.html 3),4) initMain() in jay_main.js -> 5) jay_worker.html ->
//   6) initMain() in jay_main.js -> 7),8) in jay_wroker.js -> 9),10) initMain() in jay_main.js (socket connection)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const initMain = async (launch, winid) => { //1.2) 2.2) 2.12) 3.3)
    if (hush.webview.on) return true
    if (!window.Notification) { //window.Notification || window.mozNotification || window.webkitNotification
        hush.msg.alert("This browser does not support window.Notification.")
        return false
    }
    if (!indexedDB) {
        hush.msg.alert("This browser does not support html5 IndexedDB.")
        return false
    }
    if (!Worker) {
        hush.msg.alert("This browser does not support html5 Web Worker.")
        return false
    }
    if (location.protocol != "https:") { //http not allowed for notification with chrome
        hush.msg.alert("Https needed (for notification especially in chrome).")
        return false
    }    
    const permission = await window.Notification.requestPermission() 
    if (permission != "granted") {                        
        hush.msg.alert("Notification permission should be granted for this site.")
        return false
    }
    const rs = await hush.auth.verifyLogin() //Suppose that already authenticated in your portal login especially in standalone mode.
    if (rs.code != hush.cons.result_ok) {
        hush.msg.alert("initMain: " + rs.msg + ' : You need logout and relogin')
        return false
    }
    //If you want your messenger to be authenticated independently from your portal, apply next 2 rows of coding instead above verifyLogin().
    //메신저를 포털로부터 독립적인 인증을 원하면 바로 위 verifyLogin()을 막고 아래 두줄을 적용하면 됨.     
    //let rsA = await hush.auth.chkAutoLogin() //if not autologin, login required
    //if (rsA == null || rsA.code != hush.cons.result_ok) rsB = await hush.auth.login()
    set_g() 
    //1.3) 2.3) 2.13) 3.4) Web Worker makes auto-launch for only one messenger on your corporate portal and let you maintain as only one whether auto or not. (offline competition)
    //1.3) 2.3) 2.13) 3.4) Web Worker는 사내포털에서 1개의 메신저만 자동실행하게 해주며 실행후에도 자동이든 수동이든 1개의 메신저만 유지하도록 관리함 (offline competition)
    const worker = new Worker(hush.cons.worker_path + "?" + hush.util.getRnd().toString()) //offline competition for autolaunch, maintaining winner for manuallaunch. ? tp remove cache
    worker.onerror = function(err) {
        $("#txt_msg").html(err.message)
        worker.terminate()			
    }
    worker.onmessage = async function(e) {
        try {
            $("#txt_winid").html(e.data.winid) 
            if (e.data.code == "idb_upgraded" || e.data.code == "idb_connected") { //1.5) 2.5) 3.5) from jay_worker.js
                //1.5) 2.5) winid is undefined when EmbededType. 1.5) 2.5) 경합시에는 winid=undefined. 
                //2.15) 3.6) Forward winid only when StandaloneType. 2.15) 3.6) StandaloneType일 때는 winid 전달. 
                worker.postMessage({ code : launch, msg : winid })
            } else if (e.data.code == "winner") { 
                const _token = hush.http.getCookie("token")
                if (!_token || _token == "") {
                    //See $("#btn_logout").on("click", function() in erp_portal.html.
                    //Messenger that embeded in other pager also should be terminated if the page that does not have embeded logouted : replace portal page than disconnect.
                    //메신저가 임베디드되어 있지 않은 웹페이지(탭)에서 로그아웃시키면 임베디드된 페이지에서도 메신저가 종료되게 함 : disconnect보다 아예 포털페이지로 replace함.
                    location.replace("/" + hush.cons.erp_portal) //hush.msg.alert("disconnect") 
                }
                let _type
                if (winid && prevType == "") {
                    _type = "set_new" //3.9) set_new is fixed only once in case of standalone. 3.9) set_new는 standalone일 때만 처음 한번만 설정됨. 
                } else {
                    _type = "chk_embeded"
                }
                prevType = _type
                //1.8) 2.8) 2.18) Browser windows(tabs) compete with each other (in offline) and then the winner compete with another winner of the other browser (in online with http call).
                //1.8) 2.8) 2.18) 동일 브라우저내에서는 윈도우(탭)끼리 (offline)경합을 벌여 1등이 되면 http call을 통해 각 브라우저의 1등끼리 (online)경합으로 최종 winner를 결정함.
                let rq = { type : _type, userkey : hush.cons.w_key + g_userid, winid : e.data.winid } //e.data.winid will be defined in all case (standalone or not)
                const rs1 = await hush.http.ajax(hush.cons.route + "/chk_redis", rq) //See chk_redis.js. (online competition for autolaunch, maintaining winner for manuallaunch)      
                if (rs1.code == hush.cons.result_ok) { //console.log(_type+"==="+e.data.winid+"==="+rs1.result+"==="+rs1.ip)
                    if (!rs1.result) return //watch out for stream.on('end') in chk_redis.js
                    if (rs1.result == "another") {
                        $("#txt_msg").html("Messenger is now running on another tab or browser / " + e.data.msg)
                    } else if (rs1.result == "same") { //기존 winner 계속. Winner continued 2.20) end
                        $("#txt_msg").html("Messenger is now running on this tab / " + e.data.msg)
                    } else { //new. New winner. 새로운 우승자. //console.log(_type+"@@@"+e.data.winid+"@@@"+rs1.result)                            
                        if (runFromStandalone) { //2.19) 3.10)
                            hush.socket = await hush.sock.connect(io, { token : hush.user.token, userkey : hush.user.key, userid : g_userid, winid : e.data.winid, userip : rs1.userip }) 
                            initStandAlone(rs)
                        } else if (hush.http.getCookie("standalone") == "Y" && hush.http.getCookie("launched_standalone_once") != "Y") { //2.9) Auto-Launching standalone messenger
                            $("#txt_state").html("Standalone messenger launched in another window")
                            hush.http.setCookie("launched_standalone_once", "Y") 
                            //Even if it is standalone type, it launches just once for the starting and auto started as embeded type next time. 
                            //Standalone도 한번만 자동실행되며 이후 auto에서는 embeded로 자동 실행됨.
                            window.open(hush.cons.app + "?launch=auto&winid=" + e.data.winid) //2.10) go to /public/jay/index.html
                            //2.10) StandaloneType when launching (not when competition) has winid=someValue. 2.10) 경합이 아닌 실행시에는 StandaloneType은 winid=someValue. 
                        } else { //1.9) Auto-Launching embeded messenger
                            $("#txt_state").html("Embeded messenger started at this window tab")
                            hush.socket = await hush.sock.connect(io, { token : hush.user.token, userkey : hush.user.key, userid : g_userid, winid : e.data.winid, userip : rs1.userip }) 
                            getUnreadForAll() 
                            procSettingOnLoad(rs)                       
                        }
                    }
                } else {
                    worker.terminate()
                    $("#txt_msg").html("chk_redis: " + rs1.msg)
                    $("#txt_msg").css("color", "red")
                    hush.auth.chk_logout(rs1.code, rs1.msg)
                }
            } else if (e.data.code == "0") {	
                $("#txt_msg").html(e.data.msg) //skip
            } else {
                worker.terminate()
                $("#txt_msg").html(e.data.code + "/" + e.data.msg)
            }
        } catch (ex) {
            worker.terminate()
            console.log("from worker: ", ex.toString())
            $("#txt_msg").html("from worker: " + ex.message)
            $("#txt_msg").css("color", "red")
        }
    }
    return true
}

//When messenger terminating its chat rooms and notifications also should be terminated.
//메신저 종료시 그에 종속된 채팅방 및 알림 등을 같이 종료시킴.
const procUnload = () => {
    for (let roomid in hush.sock.rooms) {
        const _win = hush.sock.rooms[roomid]
        if (_win && !_win.closed) _win.close()
    }
    for (let roomid in hush.noti.notis) {
        const _noti = hush.noti.notis[roomid]
        if (_noti) _noti.close()
    }
}

const set_g = () => {
    hush.user = hush.auth.setUser()
    g_userkey = hush.user.key 
    g_userid = hush.user.id
    g_usernm = hush.user.nm
    g_orgcd = hush.user.orgcd
    g_token10 = hush.user.token.slice(-10)
}

const initStandAlone = (rs) => {
    procSetting("load", rs, true)
    procScrollEvent() //not used for embeded
    procMenuTop(hush.http.getCookie("mode")) //not used for embeded
    if (g_mode != BTN_MODE_CHAT) getUnreadForAll() 
    $("#header_title").html(g_usernm + ((rs.nicknm != "") ? " [" + rs.nicknm + "]" : ""))
}

function procNewChat(useridArr) { //invoked from index.html and jay_main.js : Mobile Only
    const new_roomid = hush.util.createId(g_token10)
    if (useridArr.indexOf(g_userid) == -1) useridArr.push(g_userid) //me included
    const rq = { masterid : g_userid, masternm : g_usernm, userids : useridArr }
    if (hush.webview.ios) {
    } else if (hush.webview.and) {
        AndroidMain.openRoom("newFromMain", new_roomid, "", JSON.stringify(rq))
    }
}

////////////////////////////////////////////////////////////////////////mobile webview
const startFromWebView = async (from, obj, rs) => {
    try {
        hush.auth.setCookieForUser(obj, "Y", true)
        set_g()
        if (g_win_type) {
            procMenuTop(BTN_MODE_PEOPLE, BTN_PEOPLE_COMPANY)
        } else {
            initStandAlone(rs)
            AndroidMain.doneLoad()
        }     
    } catch (ex) {
        hush.msg.alert("startFromWebView: " + ex.message)
    }
}

const getFromWebViewSocket = (from, json) => {
    try {
        if (!funcSockEv || !funcSockEv[json.ev]) return //Every event data object comes here even if it is not defined in this page. 
        funcSockEv[json.ev].call(null, json.data)
    } catch (ex) {
        hush.msg.alert("main:getFromWebViewSocket: (" + JSON.stringify(json) + ")\n" + ex.message)
    }
}

const newchat = (from, obj) => { 
    procNewChat(obj.userids.split(hush.cons.deli))
}
////////////////////////////////////////////////////////////////////////
