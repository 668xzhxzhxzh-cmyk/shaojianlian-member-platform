import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "邵教练专属会员平台",
    short_name: "邵教练会员",
    description: "训练、饮食、打卡、身体数据、预约与 Hermes 智能健康助理。",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf6",
    theme_color: "#3f4d31",
    lang: "zh-CN",
    orientation: "portrait-primary",
  };
}
