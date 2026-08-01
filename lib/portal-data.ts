export type PortalView =
  | "dashboard"
  | "training"
  | "nutrition"
  | "checkins"
  | "body"
  | "booking"
  | "assistant"
  | "benefits"
  | "coach"
  | "coach-members"
  | "coach-schedule"
  | "coach-training"
  | "coach-nutrition"
  | "coach-body"
  | "admin"
  | "admin-ai"
  | "admin-notifications"
  | "admin-users"
  | "admin-settings";

export type Role = "member" | "coach" | "admin";

export type BodyMetric = {
  id: string;
  date: string;
  weight: number;
  bodyFat: number;
  muscle: number;
  waist: number;
};

export type Meal = {
  id: string;
  type: "早餐" | "午餐" | "加餐" | "晚餐";
  time: string;
  food: string;
  calories: number;
  protein: number;
  completed: boolean;
};

export type Booking = {
  id: string;
  day: string;
  date: string;
  time: string;
  title: string;
  coach: string;
  focus?: string;
  status: "已完成" | "已预约" | "可预约" | "待确认" | "已取消";
};

export type TrainingPlan = {
  phase: string;
  goal: string;
  frequency: number;
  focus: string;
  note: string;
  updatedAt: string;
  days: Array<{
    id: string;
    title: string;
    duration: string;
    exercises: string[];
  }>;
};

export type NutritionPlan = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  reminder: string;
  updatedAt: string;
  meals: Array<{
    type: "早餐" | "午餐" | "加餐" | "晚餐";
    time: string;
    food: string;
    calories: number;
  }>;
};

export type BodyFeedback = {
  id: string;
  date: string;
  summary: string;
  nextFocus: string;
  risk: "良好" | "注意" | "需关注";
};

export type Suggestion = {
  id: string;
  member: string;
  avatar: string;
  title: string;
  category: "训练调整" | "饮食建议" | "恢复提醒" | "风险提示";
  content: string;
  status: "待确认" | "已发送" | "草稿";
  priority: "普通" | "重要";
};

export type PortalState = {
  profile: {
    id: string;
    name: string;
    phone: string;
    plan: string;
    expiresAt: string;
    coach: string;
    level: string;
  };
  bodyMetrics: BodyMetric[];
  meals: Meal[];
  waterMl: number;
  checkinDates: string[];
  streak: number;
  bookings: Booking[];
  suggestions: Suggestion[];
  trainingPlan: TrainingPlan;
  nutritionPlan: NutritionPlan;
  bodyFeedbacks: BodyFeedback[];
};

export const defaultTrainingPlan: TrainingPlan = {
  phase: "第 3 周",
  goal: "体脂降至 15%",
  frequency: 3,
  focus: "下肢力量、核心稳定、动作质量",
  note: "动作质量优先，训练中保持 RPE 7–8。根据当天恢复状态决定是否增加最后一组。",
  updatedAt: "2026-07-29",
  days: [
    { id: "day-1", title: "下肢力量与髋稳定", duration: "70 分钟", exercises: ["高脚杯深蹲 · 4×10", "罗马尼亚硬拉 · 4×10", "保加利亚分腿蹲 · 3×10", "死虫式 · 3×12"] },
    { id: "day-2", title: "上肢拉力与肩胛控制", duration: "65 分钟", exercises: ["高位下拉 · 4×10", "坐姿划船 · 4×12", "面拉 · 3×15", "农夫行走 · 4×30m"] },
    { id: "day-3", title: "全身整合与心肺", duration: "60 分钟", exercises: ["壶铃硬拉 · 4×12", "台阶蹬踏 · 3×12", "雪橇推 · 6×20m", "低强度有氧 · 15min"] },
  ],
};

export const defaultNutritionPlan: NutritionPlan = {
  calories: 1800,
  protein: 120,
  carbs: 180,
  fat: 60,
  reminder: "训练日前后优先保证碳水；鄂州本地饮食可保留清淡汤类，减少重油、含糖饮料与夜宵。",
  updatedAt: "2026-07-29",
  meals: [
    { type: "早餐", time: "07:30", food: "燕麦粥、鸡蛋、无糖牛奶、蓝莓", calories: 450 },
    { type: "午餐", time: "12:30", food: "糙米饭、清蒸鱼、西兰花、菌菇", calories: 550 },
    { type: "加餐", time: "16:00", food: "香蕉、无糖酸奶", calories: 200 },
    { type: "晚餐", time: "19:00", food: "鸡胸肉、红薯、菠菜、豆腐", calories: 500 },
  ],
};

export const demoState: PortalState = {
  profile: {
    id: "member-li",
    name: "李明",
    phone: "138****5206",
    plan: "尊享会员 · 年度计划",
    expiresAt: "2027/07/10",
    coach: "邵教练",
    level: "VIP",
  },
  bodyMetrics: [
    { id: "m1", date: "07/08", weight: 70.8, bodyFat: 16.1, muscle: 33.8, waist: 82.1 },
    { id: "m2", date: "07/11", weight: 70.3, bodyFat: 15.8, muscle: 34.0, waist: 81.7 },
    { id: "m3", date: "07/14", weight: 69.8, bodyFat: 15.5, muscle: 34.2, waist: 81.2 },
    { id: "m4", date: "07/17", weight: 69.2, bodyFat: 15.1, muscle: 34.6, waist: 80.6 },
    { id: "m5", date: "07/20", weight: 68.9, bodyFat: 14.9, muscle: 34.8, waist: 80.1 },
    { id: "m6", date: "07/23", weight: 68.5, bodyFat: 14.6, muscle: 35.0, waist: 79.8 },
    { id: "m7", date: "07/26", weight: 68.2, bodyFat: 14.4, muscle: 35.2, waist: 79.4 },
    { id: "m8", date: "07/29", weight: 67.9, bodyFat: 14.2, muscle: 35.4, waist: 79.0 },
  ],
  meals: [
    { id: "meal-1", type: "早餐", time: "07:30", food: "燕麦粥 + 鸡蛋 + 牛奶 + 蓝莓", calories: 450, protein: 28, completed: true },
    { id: "meal-2", type: "午餐", time: "12:30", food: "糙米饭 + 鸡胸肉 + 西兰花", calories: 550, protein: 46, completed: true },
    { id: "meal-3", type: "加餐", time: "16:00", food: "香蕉 + 无糖酸奶", calories: 200, protein: 12, completed: false },
    { id: "meal-4", type: "晚餐", time: "19:00", food: "三文鱼 + 藜麦 + 菠菜沙拉", calories: 400, protein: 38, completed: false },
  ],
  waterMl: 1800,
  checkinDates: ["07/23", "07/24", "07/25", "07/26", "07/27", "07/28"],
  streak: 18,
  bookings: [
    { id: "b1", day: "周一", date: "7/27", time: "09:00–10:00", title: "一对一私教", coach: "邵教练", status: "已完成" },
    { id: "b2", day: "周二", date: "7/28", time: "11:00–12:00", title: "一对一私教", coach: "邵教练", status: "已完成" },
    { id: "b3", day: "周三", date: "7/29", time: "10:00–11:00", title: "一对一私教", coach: "邵教练", status: "已预约" },
    { id: "b4", day: "周四", date: "7/30", time: "14:00–15:00", title: "一对一私教", coach: "邵教练", status: "待确认" },
    { id: "b5", day: "周五", date: "7/31", time: "18:00–19:00", title: "一对一私教", coach: "邵教练", status: "可预约" },
    { id: "b6", day: "周六", date: "8/1", time: "16:00–17:00", title: "一对一私教", coach: "邵教练", status: "可预约" },
    { id: "b7", day: "周日", date: "8/2", time: "10:00–11:00", title: "一对一私教", coach: "邵教练", status: "可预约" },
  ],
  suggestions: [
    {
      id: "s1",
      member: "李明",
      avatar: "李",
      title: "减脂专项调整",
      category: "训练调整",
      content: "近 7 天训练完成率下降，建议将上肢推举强度下调 10%，保持下肢训练强度，并安排一次肩部放松评估。",
      status: "待确认",
      priority: "重要",
    },
    {
      id: "s2",
      member: "王芳",
      avatar: "王",
      title: "体态改善跟进",
      category: "恢复提醒",
      content: "近期久坐时间增加，建议本周加入两次胸椎活动与髋屈肌拉伸，每次 12 分钟。",
      status: "待确认",
      priority: "普通",
    },
    {
      id: "s3",
      member: "张伟",
      avatar: "张",
      title: "增肌饮食优化",
      category: "饮食建议",
      content: "蛋白质日均缺口约 22g，建议训练后增加一份低脂奶与鸡蛋，晚餐主食增加 30g。",
      status: "草稿",
      priority: "普通",
    },
  ],
  trainingPlan: defaultTrainingPlan,
  nutritionPlan: defaultNutritionPlan,
  bodyFeedbacks: [
    {
      id: "feedback-1",
      date: "2026-07-29",
      summary: "本周体重和体脂下降节奏稳定，肌肉量保持良好。下一阶段继续以动作质量和稳定训练频率为主。",
      nextFocus: "睡眠时长、膝部疼痛评分、训练后恢复",
      risk: "良好",
    },
  ],
};

export const trainingExercises = [
  { name: "深蹲", detail: "4 组 × 12 次", load: "40 kg", focus: "下肢力量" },
  { name: "杠铃卧推", detail: "4 组 × 10 次", load: "30 kg", focus: "胸部" },
  { name: "俯身划船", detail: "4 组 × 12 次", load: "30 kg", focus: "背部" },
  { name: "平板支撑", detail: "3 组 × 60 秒", load: "自重", focus: "核心" },
];

export const memberRows = [
  { id: "member-li", name: "李明远", plan: "减脂塑形 · 私教 24 节", goal: "体脂降至 15%", recovery: 82, attendance: 92, risk: "良好", last: "今天 07:30", phone: "138****5206", next: "今天 14:00" },
  { id: "member-wang", name: "王雨桐", plan: "体态改善 · 私教 18 节", goal: "改善圆肩与骨盆前倾", recovery: 65, attendance: 88, risk: "注意", last: "昨天 18:20", phone: "136****1183", next: "明天 09:30" },
  { id: "member-zhang", name: "张小北", plan: "增肌进阶 · 私教 30 节", goal: "增肌 3 kg", recovery: 76, attendance: 96, risk: "良好", last: "今天 06:45", phone: "159****9021", next: "周六 10:00" },
  { id: "member-chen", name: "陈思颖", plan: "核心重建 · 私教 20 节", goal: "提升核心稳定", recovery: 58, attendance: 74, risk: "注意", last: "2 天前 21:10", phone: "158****3378", next: "周五 18:00" },
  { id: "member-liu", name: "刘一航", plan: "运动表现 · 私教 16 节", goal: "恢复膝关节活动度", recovery: 42, attendance: 58, risk: "需关注", last: "3 天前 19:30", phone: "137****6152", next: "待安排" },
];

export function formatShanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}
