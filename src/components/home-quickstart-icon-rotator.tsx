import deepSeekIcon from '@/assets/svg/DeepSeek.svg'
import glmIcon from '@/assets/svg/GLM.svg'
import hunYuanIcon from '@/assets/svg/HY3.svg'
import kimiIcon from '@/assets/svg/KImi K3.svg'
import mimoIcon from '@/assets/svg/MiMo.svg'
import minimaxIcon from '@/assets/svg/MiNIMax.svg'
import qwenIcon from '@/assets/svg/qwen.svg'
import seedanceIcon from '@/assets/svg/Seedance.svg'
import type { CSSProperties } from 'react'
import './home-quickstart-icon-rotator.css'

const QUICKSTART_ICONS = [
  { src: deepSeekIcon, name: 'DeepSeek' },
  { src: glmIcon, name: 'GLM' },
  { src: hunYuanIcon, name: 'Hunyuan' },
  { src: kimiIcon, name: 'Kimi' },
  { src: mimoIcon, name: 'MiMo' },
  { src: minimaxIcon, name: 'MiniMax' },
  { src: qwenIcon, name: 'Qwen' },
  { src: seedanceIcon, name: 'Seedance' },
] as const

export function HomeQuickstartIconRotator() {
  return <span className="home-quickstart-icon-rotator" aria-hidden="true">
    {QUICKSTART_ICONS.map((icon, index) => <img
      className="home-quickstart-icon-rotator__icon"
      key={icon.name}
      src={icon.src}
      alt=""
      style={{ '--home-quickstart-icon-index': index } as CSSProperties}
    />)}
  </span>
}
