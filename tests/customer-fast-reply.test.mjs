import assert from "node:assert/strict";
import test from "node:test";
import {
  avoidRepeatedCustomerReply,
  createCustomerFastReply,
  recentImageDescription,
  selectRelevantCustomerState,
} from "../server/customer-fast-reply.mjs";

test("customer schedule and reminder answers use verified state without model tokens", () => {
  const memberState = { bookings: [{ date: "8/18", time: "15:00-16:00", title: "上肢力量", status: "已预约" }] };
  assert.match(createCustomerFastReply({ customerText: "最近的课表", memberName: "会员", memberState }), /8\/18/);
  assert.match(createCustomerFastReply({ customerText: "你可以提醒我上课吗", memberState }), /会按系统设置发送提醒/);
});

test("customer model context contains only intent-relevant data", () => {
  const state = {
    profile: { id: "member-1", phone: "13800000000", name: "测试会员" },
    bookings: Array.from({ length: 20 }, (_, index) => ({ id: `b-${index}` })),
    trainingPlan: { goal: "力量" },
    nutritionPlan: { calories: 1800 },
    bodyMetrics: Array.from({ length: 10 }, (_, index) => ({ id: `m-${index}` })),
  };
  const result = selectRelevantCustomerState(state, "这餐热量怎么样", "图片里有鸡肉和米饭");
  assert.equal(result.profile.id, undefined);
  assert.equal(result.profile.phone, undefined);
  assert.deepEqual(result.nutritionPlan, { calories: 1800 });
  assert.equal(result.trainingPlan, undefined);
  assert.equal(result.bookings, undefined);
  assert.equal(result.bodyMetrics.length, 4);
});

test("image follow-up reuses recent image context and exact duplicate replies are suppressed", () => {
  const history = [
    { role: "user", content: "[图片] 一份鸡肉、米饭和蔬菜" },
    { role: "assistant", content: "蛋白质和碳水搭配合理。" },
  ];
  assert.match(recentImageDescription(history, "分析一下这个"), /鸡肉/);
  assert.match(avoidRepeatedCustomerReply("蛋白质和碳水搭配合理。", history), /刚才的结论仍适用/);
});
