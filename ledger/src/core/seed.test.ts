import { describe, expect, it } from 'vitest'
import { decideSeeding } from './seed'

describe('预置分类的播种决策', () => {
  it('全新的库（无标记、无分类、无账目）应当播种', () => {
    expect(decideSeeding(null, 0, 0)).toBe('seed')
  })

  it('回归测试：老库绝不能再插入预置分类', () => {
    // 本次 bug 的核心场景：修复上线后第一次启动，老库里已有分类但没有标记。
    // 这里必须走 markOnly（只补标记），一旦返回 seed，用户删掉的分类就会当场复活。
    expect(decideSeeding(null, 11, 200)).toBe('markOnly')
    expect(decideSeeding(null, 3, 0)).toBe('markOnly')
  })

  it('分类被删光但记过账，仍然算老库，不能把预置分类补回来', () => {
    // 这是「只看分类数量」那种写法的漏洞：用户把分类全删了，
    // 若按「分类数为 0 就播种」处理，11 个预置分类会全部弹回来。
    expect(decideSeeding(null, 0, 20)).toBe('markOnly')
    expect(decideSeeding(null, 0, 1)).toBe('markOnly')
  })

  it('已有标记时永远跳过，不管分类和账目有多少', () => {
    expect(decideSeeding('1', 0, 0)).toBe('skip')
    expect(decideSeeding('1', 11, 200)).toBe('skip')
    expect(decideSeeding('1', 3, 0)).toBe('skip')
  })

  it('空字符串标记视为未设置', () => {
    expect(decideSeeding('', 0, 0)).toBe('seed')
    expect(decideSeeding('', 5, 0)).toBe('markOnly')
  })
})
