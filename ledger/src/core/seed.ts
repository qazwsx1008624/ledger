/**
 * 播种决策（纯函数，可测）。
 *
 * 背景 bug：早期实现每次打开数据库都会执行一遍 SEED_CATEGORIES 的 `INSERT OR IGNORE`。
 * `INSERT OR IGNORE` 只能防「重复插入已经存在的行」，**拦不住用户删除后的行被重新创建**：
 * 删掉「医疗」后那行就不存在了，下次打开会被当成新行插回来。
 * 重命名同理——把「饮食」改成「吃饭」后，原名会被重新插一条，变成两个分类。
 *
 * 因此播种必须是「一辈子只做一次」的动作，靠 meta 表里的持久标记来判断。
 * 但要小心一个陷阱：**修复上线后的第一次启动，老库里还没有那个标记**。
 * 如果这时简单地「没标记就播种」，用户之前删掉的分类会再被补一遍。
 * 所以必须能区分「全新的库」与「已经用过的老库」。
 */
export type SeedingDecision =
  /** 全新的库：插入预置分类 */
  | 'seed'
  /** 老库（此前已播过种，只是没有标记）：只写入标记，绝不插入 */
  | 'markOnly'
  /** 已经播过种：什么都不做，删了就是删了 */
  | 'skip'

/**
 * @param seededFlag     meta 表里 'seeded_categories' 的值，没写过传 null
 * @param categoryCount  当前分类总数
 * @param transactionCount 当前账目总数（包含已软删除的）
 */
export function decideSeeding(
  seededFlag: string | null,
  categoryCount: number,
  transactionCount: number,
): SeedingDecision {
  // 空字符串也视为「没有标记」，避免脏数据导致重复播种
  if (seededFlag !== null && seededFlag !== '') return 'skip'

  // 有分类 → 显然是用过的库
  if (categoryCount > 0) return 'markOnly'

  // 分类被删光了，但记过账 → 仍然是用过的库，绝不能把预置分类补回来
  if (transactionCount > 0) return 'markOnly'

  // 既没有分类也没有任何账目 → 全新的库
  return 'seed'
}
