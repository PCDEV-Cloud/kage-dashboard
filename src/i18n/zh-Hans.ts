import type { Strings } from "./strings";

// Wersja niezweryfikowana przez osobę znającą język.
export const zhHans: Strings = {
  strategyName: "KAGE",
  strategyDescription: "根据楼层、区域和设备自动生成的情境仪表板。",
  viewHome: "家",
  unassignedFloor: "未分配楼层",
  unassignedEntities: "未分配区域",
  areaCount: { other: "{n} 个区域" },
  entityCount: { other: "{n} 个实体" },
  emptyHome: "尚无楼层或区域。请在 设置 → 区域、标签和地带 中添加。",
  unassignedHint: "请在 设置 → 设备与服务 → 设备 中为其设备分配区域（实体会继承设备的区域）。",
  noUnassignedDevices: "所有设备都已分配区域。",
  moreItems: "……另有 {n} 个。",
  systemEntities: { other: "{n} 个系统实体（自动化、更新、人员等）不计入：它们不属于房间。" },
  skeletonNotice: "KAGE 技术预览：引擎正在读取您的家。最终外观将在后续阶段推出。",
};
