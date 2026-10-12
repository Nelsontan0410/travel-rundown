"""由北海道行程（自由文本）按转换提示词规则生成 qa/fixtures/hokkaido.md。
订单号已打码；这是 A0 的测试数据，不含真实订单号和金额。"""
from urllib.parse import quote
import sys

def gl(q): return "https://www.google.com/maps/dir/?api=1&destination=" + quote(q, safe="")
def gt(o, d): return "https://www.google.com/maps/dir/?api=1&origin=%s&destination=%s&travelmode=transit" % (quote(o, safe=""), quote(d, safe=""))

out = []
def head(t, a, b, extra=""):
    out.append(f"# {t}\n- 日期: {a} ~ {b}\n- 出发地时区: Asia/Singapore\n- 目的地: 日本\n")
def day(n, d, city, tz, theme=""):
    out.append(f"\n## Day {n} | {d} | {city} | {tz}" + (f" | {theme}" if theme else "") + "\n")
def item(typ, title, time="", place=None, addr=None, to=None, nav=None, ref=None, status=None,
         note=None, alt=None, fixed=False, tnote=None, meta=None):
    out.append(f"### [{typ}] {time + ' ' if time else ''}{title}")
    if place: out.append(f"- 地点: {place[0]}" + (f" | {place[1]}" if len(place) > 1 else ""))
    if addr: out.append(f"- 地址: {addr[0]}" + (f" | {addr[1]}" if len(addr) > 1 else ""))
    if to: out.append(f"- 终点: {to[0]}" + (f" | {to[1]}" if len(to) > 1 else ""))
    if nav: out.append(f"- 导航: {nav}")
    if ref: out.append(f"- 订单: {ref}")
    if status: out.append(f"- 预订状态: {status}")
    if tnote: out.append(f"- 时间说明: {tnote}")
    if fixed: out.append("- 固定: 是")
    if alt: out.append(f"- 备选: {alt}")
    if note: out.append(f"- 备注: {note}")
    for k, v in (meta or {}).items(): out.append(f"- {k}: {v}")
    out.append("")

head("北海道冬季旅程", "2027-01-09", "2027-01-19")

day(1, "2027-01-09", "新加坡", "Asia/Singapore", "出发")
item("flight", "ANA NH844 新加坡 → 东京羽田", "22:20-05:55+1", ("新加坡樟宜机场 T2", "Changi Airport Terminal 2"), to=("东京羽田机场 T2", "羽田空港第2ターミナル"), nav=gl("Changi Airport Terminal 2"), fixed=True, note="夜宿飞机；先办理值机和托运", meta={"航班号": "NH844", "航站楼": "T2"})

day(2, "2027-01-10", "东京", "Asia/Tokyo", "浅草 · 秋叶原 · 东京塔 · 银座")
item("transit", "羽田 → 田端酒店寄放行李", "05:55", ("羽田空港第2ターミナル",), to=("Tabist TOKYO CITY VIEW HOTEL",), nav=gt("羽田空港第2ターミナル", "Tabist TOKYO CITY VIEW HOTEL 田端"), note="入境、领行李后前往；提前到店的行李安排要与酒店确认")
item("lodging", "Tabist TOKYO CITY VIEW HOTEL（田端）", "15:00", ("Tabist TOKYO CITY VIEW HOTEL",), nav=gl("Tabist TOKYO CITY VIEW HOTEL 田端"), status="已确认", note="正式入住 15:00 后；订单已确认并付款")
item("spot", "浅草：雷门、仲见世通、浅草寺", place=("浅草寺", "浅草寺"), nav=gl("浅草寺"), tnote="上午", note="拍照和短逛")
item("spot", "午餐：博多风龙", place=("博多风龙", "博多風龍"), nav=gl("博多風龍"), tnote="中午", note="具体分店按当天动线选择，尚未订位")
item("spot", "秋叶原", place=("秋叶原", "秋葉原"), nav=gl("秋葉原"), tnote="下午", note="电子产品、动漫街区购物；体力不足时优先缩短")
item("spot", "东京塔周边拍照", place=("东京塔", "東京タワー"), nav=gl("東京タワー"), tnote="傍晚", note="不安排登塔")
item("spot", "银座：UNIQLO 银座店", place=("UNIQLO 银座店", "ユニクロ 銀座店"), addr=("东京都中央区银座6-9-5 Ginza Komatsu 东馆", "東京都中央区銀座6-9-5 GINZA SIX 東館"), nav=gl("ユニクロ 銀座店 東京都中央区銀座6-9-5"), tnote="晚上", note="官方营业时间 11:00–21:00，出发前再核对")
item("spot", "晚餐", tnote="晚上", note="尚未订位，按实际位置和体力决定", alt="鳗の成瀬、入鹿TOKYO")

day(3, "2027-01-11", "河口湖", "Asia/Tokyo", "东京 → 富士山 / 河口湖")
item("transit", "田端 → 东京站", tnote="清晨", place=("田端駅",), to=("東京駅",), nav=gt("田端駅", "東京駅"))
item("transit", "东京站 → 富士山站 高速巴士", tnote="当天最早一班", place=("東京駅",), to=("富士山駅",), nav=gt("東京駅", "富士山駅"), note="目标约 09:00 抵达；具体班次和车票需另行核对")
item("transit", "ORIX 富士山站前店取车", "10:00", ("ORIX 富士山站前店", "オリックスレンタカー 富士山駅前店"), nav=gl("オリックスレンタカー 富士山駅前店"), fixed=True, note="只带 2 个小行李箱，大行李留东京；需确认酒店是否能寄存大行李")
item("spot", "忍野八海", place=("忍野八海", "忍野八海"), nav=gl("忍野八海"), tnote="上午", note="荞麦面、草饼或简单小吃")
item("spot", "山中湖白鸟滨", place=("山中湖 白鸟滨", "山中湖 白鳥浜"), nav=gl("山中湖 白鳥浜"), tnote="中午")
item("spot", "THE PARK 河口湖店", place=("THE PARK 河口湖店", "THE PARK 河口湖店"), nav=gl("THE PARK 河口湖店"), tnote="下午", note="pancake 与拍照")
item("spot", "河口湖周边", place=("河口湖", "河口湖"), nav=gl("河口湖"), tnote="傍晚", note="晚餐备选：ほうとう不動、甲州屋；排队太久就在附近简单用餐")
item("lodging", "Toyoko Inn Fuji Kawaguchiko Ohashi", place=("Toyoko Inn Fuji Kawaguchiko Ohashi", "東横INN 富士河口湖大橋"), nav=gl("東横INN 富士河口湖大橋"), status="已确认", note="订单已确认并付款，含早餐")

day(4, "2027-01-12", "河口湖", "Asia/Tokyo", "还车 · 河口湖 · 回东京")
item("note", "东横 INN 早餐、退房", tnote="早上")
item("transit", "ORIX 富士山站前店还车", place=("ORIX 富士山站前店", "オリックスレンタカー 富士山駅前店"), nav=gl("オリックスレンタカー 富士山駅前店"), fixed=True, tnote="10:00 前", note="还车后各景点的交通和停留时间尚未落实，按实际班次调整")
item("spot", "忠灵塔 / 新仓山浅间公园", place=("新仓山浅间公园", "新倉山浅間公園"), nav=gl("新倉山浅間公園"), tnote="上午")
item("spot", "本町通", place=("本町通", "本町通り"), nav=gl("富士吉田 本町通り"), tnote="中午", note="午餐备选：BRAND NEW DAY COFFEE、Lake Bake")
item("spot", "河口湖", place=("河口湖", "河口湖"), nav=gl("河口湖"), tnote="下午")
item("spot", "大石公园", place=("大石公园", "大石公園"), nav=gl("大石公園"), tnote="下午", note="下午茶可选 Fujisan Shokupan / Lake Bake；时间不足就取消")
item("transit", "河口湖 → 大月 → 涩谷", place=("河口湖駅",), to=("渋谷駅",), nav=gt("河口湖駅", "渋谷駅"), note="从河口湖搭车至大月，再转 JR 前往涩谷")
item("spot", "晚餐：白秋神户牛", place=("白秋 神戸鉄板焼", "白秋 神戸鉄板焼"), nav=gl("白秋 神戸鉄板焼 渋谷"), tnote="晚上", note="尚未查到订位确认")
item("lodging", "回田端 Tabist TOKYO CITY VIEW HOTEL", place=("Tabist TOKYO CITY VIEW HOTEL",), nav=gl("Tabist TOKYO CITY VIEW HOTEL 田端"), status="已确认", note="订单已确认并付款")

day(5, "2027-01-13", "登别", "Asia/Tokyo", "羽田 → 新千岁 → 登别")
item("transit", "田端 → 羽田 T2", tnote="早上", place=("田端駅",), to=("羽田空港第2ターミナル",), nav=gt("田端駅", "羽田空港第2ターミナル"))
item("flight", "ANA NH059 羽田 → 新千岁", "10:00-11:35", ("东京羽田机场 T2", "羽田空港第2ターミナル"), to=("新千岁机场", "新千歳空港"), nav=gl("羽田空港第2ターミナル"), fixed=True, meta={"航班号": "NH059"})
item("transit", "新千岁取车", "13:00", ("新千岁机场租车接驳点", "新千歳空港 レンタカー"), nav=gl("新千歳空港 レンタカー"), note="目标约 13:00；Nissan Note e-POWER 4WD、无钉冬季胎；订单及 CDW、NOC、道路救援保险需以租车确认单为准")
item("transit", "新千岁 → 登别", place=("新千歳空港",), to=("登別第一滝本館",), nav=gt("新千歳空港", "登別第一滝本館"), note="直接前往，熊牧场已取消")
item("lodging", "登别第一泷本馆", place=("登别第一泷本馆", "登別温泉 第一滝本館"), nav=gl("登別温泉 第一滝本館"), status="已确认", note="1月13日入住、14日退房；含早餐与晚餐；到店付款；19:30 后到达无法提供餐食")

day(6, "2027-01-14", "洞爷湖", "Asia/Tokyo", "雪地摩托 → 小樽")
item("note", "第一泷本馆早餐、退房", tnote="早上")
item("spot", "Snow World Toya 雪地摩托", place=("Snow World Toya", "スノーワールド洞爺"), nav=gl("スノーワールド洞爺"), tnote="早上", alt="天气或道路不适合时，取消洞爷湖段和雪地摩托，视路况从登别直接去小樽；登别至小樽也不安全则留在登别并联系住宿调整", note="目标体验约 1 小时；营业、可预约时段和订单仍需向店家核实，目前不代表已预约")
item("spot", "Silo 展望台", place=("Silo 展望台", "サイロ展望台"), nav=gl("サイロ展望台"), tnote="可选", note="时间、天气和路况合适才停，不去不影响主行程")
item("spot", "午餐：Soup Curry HLAHAL 或松前屋", tnote="中午", place=("Soup Curry HLAHAL",), nav=gl("スープカレー HLAHAL 洞爺"), alt="松前屋；排队太久就换，避免耽误去小樽")
item("spot", "新南樽市场：现蒸帝王蟹", "15:30", ("新南樽市场", "新南樽市場"), nav=gl("新南樽市場"), note="目标约 15:30–16:00；供应与营业需当天确认")
item("spot", "天狗山夜景", place=("天狗山", "天狗山"), nav=gl("天狗山 小樽"), tnote="晚上")
item("spot", "小樽运河", place=("小樽运河", "小樽運河"), nav=gl("小樽運河"), tnote="晚上")
item("lodging", "Grids Premium Hotel Otaru", place=("Grids Premium Hotel Otaru",), nav=gl("Grids Premium Hotel Otaru"), status="已确认", note="订单已确认，含 1 晚")

day(7, "2027-01-15", "富良野", "Asia/Tokyo", "小樽 → 旭川 → 美瑛 → 富良野")
item("note", "退房，车上早餐", "06:00", note="规划约 06:00–06:15 出发前往旭川；面包、零食和饮料提前准备")
item("spot", "旭山动物园 企鹅散步", "11:00", ("旭山动物园", "旭山動物園"), nav=gl("旭山動物園"), note="具体场次以动物园公布的 2027 年日程为准；散步后参观重点区域")
item("spot", "美瑛雪景", place=("美瑛", "美瑛町"), nav=gl("美瑛町"), tnote="下午", note="优先留自然光；不强行加入未确认的树景点或青池")
item("spot", "白须瀑布", place=("白须瀑布", "白ひげの滝"), nav=gl("白ひげの滝"), tnote="下午")
item("spot", "精灵露台 Ningle Terrace", place=("精灵露台", "ニングルテラス"), nav=gl("ニングルテラス 富良野"), tnote="傍晚")
item("lodging", "La Vista Furano Hills", place=("La Vista Furano Hills", "ラ・ビスタ富良野ヒルズ"), nav=gl("ラ・ビスタ富良野ヒルズ"), status="已确认", note="1月15日入住、16日退房；含 16 日早餐和夜鸣拉面（22:00–23:00）；不含晚餐。大雪或延误先缩短美瑛停留")

day(8, "2027-01-16", "札幌", "Asia/Tokyo", "还车 + 札幌拍照")
item("transit", "富良野 → 札幌", "08:00", ("ラ・ビスタ富良野ヒルズ",), to=("札幌駅",), nav=gt("ラ・ビスタ富良野ヒルズ", "札幌駅"), note="目标约 11:30 抵达札幌；先到酒店寄放行李（酒店待确认）；午餐在札幌站或酒店附近")
item("transit", "札幌站东口还车", "13:00", ("札幌站东口",  "札幌駅 東口"), nav=gl("札幌駅 東口 レンタカー"), fixed=True)
item("spot", "札幌市钟楼", place=("札幌市钟楼", "札幌市時計台"), nav=gl("札幌市時計台"), tnote="下午", note="以拍照短停为主；时间不足优先保留选定景点，其余留到 18 日")
item("spot", "白色恋人公园", place=("白色恋人公园", "白い恋人パーク"), nav=gl("白い恋人パーク"), tnote="下午")
item("spot", "圆山公园", place=("圆山公园", "円山公園"), nav=gl("円山公園 札幌"), tnote="下午")
item("spot", "北海道神宫", place=("北海道神宫", "北海道神宮"), nav=gl("北海道神宮"), tnote="下午")
item("spot", "北海道厅旧本厅舍（红砖厅舍）", place=("北海道厅旧本厅舍", "北海道庁旧本庁舎"), nav=gl("北海道庁旧本庁舎"), tnote="傍晚")
item("spot", "狸小路", place=("狸小路", "狸小路商店街"), nav=gl("狸小路商店街"), tnote="傍晚")
item("spot", "薄野", place=("薄野", "すすきの"), nav=gl("すすきの"), tnote="晚上")
item("spot", "晚餐：成吉思汗烤肉", tnote="晚上", place=("成吉思汗烤肉",), nav=gl("ジンギスカン 札幌 すすきの"), note="具体店铺及预约未确认")
item("lodging", "札幌酒店（待核实）", place=("札幌酒店",), nav=gl("札幌駅"), status="待确认", note="目前没有找到日期完全吻合且确认有效的 1 月 16 日晚订单；需补齐或核实")

day(9, "2027-01-17", "定山溪", "Asia/Tokyo", "二条市场 → 丰平峡 → 翠山亭")
item("spot", "二条市场海鲜早餐", "07:30", ("二条市场", "二条市場"), nav=gl("二条市場 札幌"), alt="首选丼兵卫，备选大矶 Oiso", note="营业时间及排队需当天确认；是建议，不是预约")
item("transit", "札幌 → 丰平峡温泉", "09:00", place=("札幌駅",), to=("豊平峡温泉",), nav=gt("札幌駅", "豊平峡温泉"), note="巴士 / 出租车；班次、接驳和行李安排需要确认")
item("spot", "丰平峡温泉", place=("丰平峡温泉", "豊平峡温泉"), nav=gl("豊平峡温泉"), tnote="上午", note="泡汤、休息；午餐在丰平峡或定山溪找日式热食，不吃印度咖喱，店铺未定")
item("lodging", "定山溪第一酒店翠山亭", "15:00", ("定山溪第一酒店翠山亭", "定山渓第一ホテル 翠山亭"), nav=gl("定山渓第一ホテル 翠山亭"), status="待确认", note="Agoda 有两笔同日期有效订单（1781010994 → 17810***94、2001523821 → 20015***21），有重复预订风险，需处理；含早餐和晚餐")
item("spot", "晚餐：翠山亭怀石料理", tnote="晚上", place=("翠山亭",), nav=gl("定山渓第一ホテル 翠山亭"), fixed=True, note="当天固定安排")

day(10, "2027-01-18", "札幌", "Asia/Tokyo", "小樽 Plan A / 札幌 Plan B")
item("transit", "离开翠山亭", "09:00", place=("定山渓第一ホテル 翠山亭",), to=("小樽駅",), nav=gt("定山渓第一ホテル 翠山亭", "小樽駅"), note="翠山亭最晚 11:00 退房；前往小樽的公共交通、行李寄放及转车时间需核实")
item("spot", "Plan A：小樽寿司午餐", tnote="中午", place=("小樽寿司",), nav=gl("伊勢鮨 小樽"), alt="Plan B：遇到大雪、交通延误或疲劳时取消小樽，留在札幌补 16 日未完成的景点和购物", note="建议顺序：伊势鮨、Sushi Takutsu、政寿司本店；均未查到订位确认")
item("spot", "小樽拍照、购物", place=("小樽",), nav=gl("小樽運河"), tnote="下午", note="按体力和天气")
item("spot", "晚餐：汤咖喱", tnote="晚上", place=("汤咖喱",), nav=gl("スープカレー 札幌"), note="具体餐厅与预约未确认")
item("lodging", "JR Inn Sapporo Kita 2 Jo", place=("JR Inn Sapporo Kita 2 Jo", "JRイン札幌北2条"), nav=gl("JRイン札幌北2条"), status="已确认", note="1月18日入住、19日退房，订单已确认")

day(11, "2027-01-19", "新千岁", "Asia/Tokyo", "回程")
item("transit", "札幌 → 新千岁机场", tnote="早上", place=("札幌駅",), to=("新千歳空港",), nav=gt("札幌駅", "新千歳空港"), note="目标约 09:00–10:00 抵达，预留 2–3 小时购物；退房")
item("spot", "机场购物", place=("新千岁机场", "新千歳空港"), nav=gl("新千歳空港"), tnote="上午", note="不要影响值机和转机")
item("flight", "ANA NH2154 新千岁 → 成田", "13:40-15:30", ("新千岁机场", "新千歳空港"), to=("成田国际机场 T1", "成田国際空港 第1ターミナル"), nav=gl("新千歳空港"), fixed=True, meta={"航班号": "NH2154"})
item("flight", "ANA NH801 成田 → 新加坡", "18:00-00:45+1", ("成田国际机场 T1", "成田国際空港 第1ターミナル"), to=("新加坡樟宜机场 T2", "Changi Airport Terminal 2"), nav=gl("成田国際空港 第1ターミナル"), fixed=True, note="转机约 2 小时 30 分钟，行李直挂", meta={"航班号": "NH801"})

open(sys.argv[1], "w").write("\n".join(out))
