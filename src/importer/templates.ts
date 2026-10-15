// 官方导入模板（Layer 1 · 精准识别）：可以在「获取导入模板」页下载。
export const JSON_TEMPLATE = `{
  "schemaVersion": 1,
  "trip": {
    "title": "北海道，日本",
    "startDate": "2027-01-13",
    "endDate": "2027-01-14",
    "homeTimezone": "Asia/Kuala_Lumpur",
    "participants": 2,
    "budget": 8000
  },
  "days": [
    {
      "day": 1,
      "date": "2027-01-13",
      "city": "札幌",
      "timezone": "Asia/Tokyo",
      "title": "抵达札幌",
      "activities": [
        {
          "type": "flight",
          "start": "08:30",
          "end": "16:10",
          "title": "吉隆坡 → 新千岁",
          "place": { "name": "吉隆坡国际机场", "localName": "Kuala Lumpur International Airport" },
          "to": { "name": "新千岁机场", "localName": "新千歳空港" },
          "flight": { "number": "XX 123", "airline": "示例航空" },
          "bookingStatus": "confirmed",
          "fixed": true
        },
        {
          "type": "lodging",
          "title": "札幌站前酒店",
          "place": { "name": "札幌站前酒店", "address": "北海道札幌市" },
          "lodging": { "checkIn": "2027-01-13", "checkOut": "2027-01-14" }
        }
      ]
    },
    {
      "day": 2,
      "date": "2027-01-14",
      "city": "小樽",
      "timezone": "Asia/Tokyo",
      "title": "小樽一日游",
      "activities": [
        {
          "type": "spot",
          "start": "10:00",
          "end": "12:00",
          "title": "小樽运河",
          "place": { "name": "小樽运河", "localName": "小樽運河" },
          "mustDo": ["运河散步", "音乐盒堂"],
          "notes": "雪天路滑"
        },
        { "type": "meal", "start": "12:30", "title": "三角市场海鲜丼", "meal": "lunch", "mustDo": ["海鲜丼"] }
      ]
    }
  ]
}
`;

/** 每行一个活动；旅程级字段写在任意一行（通常第一行）即可 */
export const CSV_TEMPLATE = `﻿trip_title,trip_start,trip_end,home_timezone,participants,budget,day,date,city,timezone,day_title,type,start,end,title,place,local_name,address,to,must_do,notes,booking_status
"北海道，日本",2027-01-13,2027-01-14,Asia/Kuala_Lumpur,2,8000,1,2027-01-13,札幌,Asia/Tokyo,抵达札幌,flight,08:30,16:10,吉隆坡 → 新千岁,吉隆坡国际机场,Kuala Lumpur International Airport,,新千岁机场,,,confirmed
,,,,,,1,2027-01-13,札幌,Asia/Tokyo,抵达札幌,lodging,,,札幌站前酒店,札幌站前酒店,,北海道札幌市,,,,
,,,,,,2,2027-01-14,小樽,Asia/Tokyo,小樽一日游,spot,10:00,12:00,小樽运河,小樽运河,小樽運河,,,运河散步；音乐盒堂,"雪天路滑，
穿防滑鞋",
,,,,,,2,2027-01-14,小樽,Asia/Tokyo,小樽一日游,meal,12:30,,三角市场海鲜丼,三角市场,,,,海鲜丼,,
`;
