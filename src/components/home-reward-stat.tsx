import type { CSSProperties } from 'react'
import './home-reward-stat.css'

const REWARD_STAT_SCALE_NUMERATOR = 1.68

// 三位及以上统一从「四位数的字号」起缩：收益是四位数字，三位数不该比它更大。
const REWARD_STAT_LONG_VALUE_SCALE = 0.42

type HomeRewardStatProps = {
  value: string
  unit: string
  label: string
}

type RewardStatStyle = CSSProperties & {
  '--home-reward-stat-scale': string
}

export function getHomeRewardStatScale(value: string): number {
  const characterCount = Array.from(value.trim().replace(/\s/g, '')).length
  // 两位以内保持设计稿字号；超过两位统一从长数字字号起步，位数更多时继续缩小。
  if (characterCount <= 2) return 1
  return Math.min(REWARD_STAT_LONG_VALUE_SCALE, REWARD_STAT_SCALE_NUMERATOR / characterCount)
}

export function HomeRewardStat({ value, unit, label }: HomeRewardStatProps) {
  const style: RewardStatStyle = {
    '--home-reward-stat-scale': getHomeRewardStatScale(value).toFixed(3),
  }

  return (
    <span className="home-reward-stat">
      <strong className="home-reward-stat__value" style={style}>
        {value}<em className={`home-reward-stat__unit${unit.trim().length > 4 ? ' home-reward-stat__unit--long' : ''}`}>{unit}</em>
      </strong>
      <small className="home-reward-stat__label">{label}</small>
    </span>
  )
}
