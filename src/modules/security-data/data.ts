import type { SecurityDataSnapshot } from './types'

/** Fixed presentation values, replaced by a real data source when the API is available. */
export const SECURITY_DATA: SecurityDataSnapshot = {
  metrics: [
    { key: 'online', label: '当前在线', value: 1268, description: '近5分钟内有操作或心跳的用户' },
    { key: 'sample', label: '采样规模', value: 8426, description: '观测窗口内使用过本产品的去重用户（基数）' },
    { key: 'entry-guide', label: '入场引导使用人数', value: 6428, description: '观测窗口内发起过的去重用户' },
    { key: 'exit-guide', label: '离场引导使用人数', value: 2196, description: '观测窗口内发起过的去重用户' },
    { key: 'map-navigation', label: '地图导航使用人数', value: 3840, description: '观测窗口内发起过的去重用户' },
    { key: 'vr-navigation', label: 'VR 导航使用人数', value: 1624, description: '观测窗口内使用过本产品的去重用户' },
    { key: 'inside', label: '已进入场馆人数', value: 3286, description: '观测窗口内已定位到场馆内的去重用户' },
    { key: 'perimeter', label: '场馆外围人数', value: 1240, description: '观测窗口内已定位到场馆外的去重用户' },
    { key: 'approaching', label: '前往场馆人数', value: 916, description: '观测窗口内已定位到管制区域外的去重用户' },
  ],
  activities: [
    { id: 'autumn-sports', name: '株洲体育中心秋季全民运动会', startAt: '2026-09-20T08:00:00+08:00', endAt: '2026-09-24T21:00:00+08:00' },
    { id: 'football', name: '青少年足球邀请赛 · 小组赛', startAt: '2026-09-21T09:00:00+08:00', endAt: '2026-09-23T18:00:00+08:00' },
    { id: 'fitness', name: '全民健身开放日 · 场馆体验活动', startAt: '2026-09-22T08:00:00+08:00', endAt: '2026-09-22T18:00:00+08:00' },
    { id: 'basketball', name: '城市篮球交流赛 · 夜场', startAt: '2026-09-22T18:30:00+08:00', endAt: '2026-09-22T22:00:00+08:00' },
  ],
  rankings: [
    {
      id: 'entry-shuttle', title: '入场 · 各接驳车选择占比', description: '观测窗口内：选择指定接驳点入场的人数/选择过接驳点入场的人数', total: 2400,
      items: [
        { id: 'l1', label: 'L1 · 株洲西站线', count: 1188 },
        { id: 'l2', label: 'L2 · 中心广场线', count: 648 },
        { id: 'l3', label: 'L3 · 神农城线', count: 360 },
        { id: 'l4', label: 'L4 · 河西停车场线', count: 204 },
      ],
    },
    {
      id: 'entry-gate', title: '入场 · 各检票口选择占比', description: '观测窗口内：选择指定入场检票口的人数/选择过入场检票口的人数', total: 5000,
      items: [
        { id: '5-1', label: '5-1 检票口', count: 1950 },
        { id: '5-2', label: '5-2 检票口', count: 1450 },
        { id: '6-1', label: '6-1 检票口', count: 1000 },
        { id: '6-2', label: '6-2 检票口', count: 600 },
      ],
    },
    {
      id: 'entry-zone', title: '入场 · 各分区选择占比 top 6', description: '观测窗口内：选择指定落座分区的人数/选择过落座分区的人数', total: 6000, limit: 6,
      items: [
        { id: '45', label: '45 区', count: 1260 }, { id: '2', label: '2 区', count: 1020 },
        { id: '18', label: '18 区', count: 840 }, { id: '33', label: '33 区', count: 660 },
        { id: '13', label: '13 区', count: 540 }, { id: '1', label: '1 区', count: 420 },
        { id: '35', label: '35 区', count: 360 }, { id: '21', label: '21 区', count: 300 },
        { id: '28', label: '28 区', count: 300 }, { id: '3', label: '3 区', count: 300 },
      ],
    },
    {
      id: 'exit-shuttle', title: '离场 · 各接驳车选择占比', description: '观测窗口内：选择指定接驳点离场的人数/选择过接驳点离场的人数', total: 1600,
      items: [
        { id: 'l1', label: 'L1 · 株洲西站线', count: 736 },
        { id: 'l2', label: 'L2 · 中心广场线', count: 448 },
        { id: 'l3', label: 'L3 · 神农城线', count: 256 },
        { id: 'l4', label: 'L4 · 河西停车场线', count: 160 },
      ],
    },
    {
      id: 'exit-zone', title: '离场 · 各分区选择占比 top 12', description: '观测窗口内：离场选择指定出发分区的人数/选择过出发分区的人数', total: 2000, limit: 12, wide: true,
      items: [
        { id: '45', label: '45 区', count: 300 }, { id: '2', label: '2 区', count: 250 },
        { id: '18', label: '18 区', count: 210 }, { id: '33', label: '33 区', count: 180 },
        { id: '13', label: '13 区', count: 160 }, { id: '1', label: '1 区', count: 150 },
        { id: '35', label: '35 区', count: 140 }, { id: '21', label: '21 区', count: 130 },
        { id: '28', label: '28 区', count: 120 }, { id: '3', label: '3 区', count: 100 },
        { id: '23', label: '23 区', count: 90 }, { id: '12', label: '12 区', count: 70 },
        { id: '7', label: '7 区', count: 60 }, { id: '9', label: '9 区', count: 40 },
      ],
    },
  ],
}
