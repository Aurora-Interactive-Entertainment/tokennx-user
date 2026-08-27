import type { CSSProperties } from 'react'
import './home-reward-stat.css'

const REWARD_STAT_SCALE_NUMERATOR = 1.68

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
  // 中文：两位以内保持设计稿字号，超过两位后随可见字符数连续缩小。
  return characterCount <= 2 ? 1 : REWARD_STAT_SCALE_NUMERATOR / characterCount
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
