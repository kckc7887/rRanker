import { RatingCalculator, RatingFields, RatingMessage, RatingTable } from '@/components/game-content/RatingCalculator';
import { useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { calculateChartRating, minimumAchievementForRating, ratingTableDescending } from '@/domain/rating';
import { parseNumericInput } from '@/utils/numeric-input';

export default function RatingToolScreen() {
  const { constant: routeConstant } = useLocalSearchParams<{ constant?: string }>();
  const [constant, setConstant] = useState(() => routeConstant && Number.isFinite(parseNumericInput(routeConstant)) ? routeConstant : '13.7'); const [achievement, setAchievement] = useState('100.5'); const [target, setTarget] = useState('300');
  const ds = parseNumericInput(constant); const ach = parseNumericInput(achievement); const targetValue = parseNumericInput(target);
  const constantError = !Number.isFinite(ds) || ds <= 0 || ds > 15 ? '定数必须大于 0 且不超过 15。' : null;
  const achievementError = !Number.isFinite(ach) || ach < 0 || ach > 101 ? '达成率必须在 0% 到理论最高 101% 之间。' : null;
  const result = !constantError && !achievementError ? calculateChartRating(ds, ach) : null;
  const reverse = !constantError && Number.isInteger(targetValue) && targetValue >= 0 ? minimumAchievementForRating(ds, targetValue) : null;
  const rows = useMemo(() => !constantError ? ratingTableDescending(ds) : [], [constantError, ds]);
  return <RatingCalculator title="DX Rating 计算器">
    <Card><RatingFields><FormField label="定数" value={constant} onChangeText={setConstant} /><FormField label="达成率 (%)" value={achievement} onChangeText={setAchievement} /></RatingFields>
      {constantError ? <RatingMessage kind="error">{constantError}</RatingMessage> : null}
      {achievementError ? <RatingMessage kind="error">{achievementError}</RatingMessage> : null}
      {!achievementError && ach > 100.5 ? <RatingMessage kind="warning">达成率有效，但 Rating 在 100.5% 封顶；当前按 100.5% 计算。</RatingMessage> : null}
      <RatingMessage kind="result">单曲 Rating：{result ?? '输入无效'}</RatingMessage><RatingMessage kind="note">理论最高达成率为 101%；仅 Rating 计算在 100.5% 封顶，显示值最终向下取整。</RatingMessage></Card>
    <Card><FormField label="目标 Rating（整数）" value={target} onChangeText={setTarget} /><RatingMessage kind="result">最低达成率：{reverse === null ? '无法达到或输入无效' : `${reverse.toFixed(4)}%`}</RatingMessage></Card>
    <RatingTable title="当前定数的达成率档" rows={rows} rowKey={row => row.achievement}
      cells={row => [`${row.achievement.toFixed(4)}%`, `Rating ${row.rating}`]} />
  </RatingCalculator>;
}
