/** 返回当前时区的自然日零点，避免日期选择器和接口边界出现跨日偏差。 */
export function startOfLocalDay(value: Date = new Date()): Date {
  const result = new Date(value)
  result.setHours(0, 0, 0, 0)
  return result
}

/** 在本地自然日上移动日期，使用 setDate 正确处理夏令时切换。 */
export function addLocalDays(value: Date, amount: number): Date {
  const result = new Date(value)
  result.setDate(result.getDate() + amount)
  return result
}

export function endOfLocalDay(value: Date): Date {
  const result = startOfLocalDay(value)
  result.setHours(23, 59, 59, 999)
  return result
}

export function startOfLocalToday(): Date {
  return startOfLocalDay()
}
