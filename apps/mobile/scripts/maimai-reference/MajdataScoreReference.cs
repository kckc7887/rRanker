// Extracted from MajdataPlay ObjectCounter.cs (GPL-3.0). See majdata-source.json.
// The scoring method is unchanged except public visibility. Empty note stand-ins only supply its type dispatch.
namespace MajdataReference;
public class NoteDrop {} public class TapDrop : NoteDrop {} public class TouchDrop : NoteDrop {}
public class HoldDrop : NoteDrop {} public class TouchHoldDrop : NoteDrop {} public class SlideBase : NoteDrop {}
public enum JudgeGrade { Miss, TooFast, LateGood, FastGood, LateGreat3rd, LateGreat2nd, LateGreat, FastGreat, FastGreat2nd, FastGreat3rd, LatePerfect3rd, FastPerfect3rd, LatePerfect2nd, FastPerfect2nd, Perfect }
public record NoteJudgeResult(bool IsBreak, JudgeGrade Grade);
public class ScoreReference {
  public long CurrentNoteBaseScore, CurrentNoteExtraScore, CurrentNoteExtraScoreClassic, LostNoteBaseScore, LostNoteExtraScore, LostNoteExtraScoreClassic;
        public void UpdateNoteScoreCount<T>(T note, in NoteJudgeResult judgeResult, int multiple = 1) where T : NoteDrop
        {
            var baseScore = 500;

            switch (note)
            {
                case TapDrop:
                case TouchDrop:
                    baseScore = 500 * multiple;
                    break;
                case HoldDrop:
                case TouchHoldDrop:
                    baseScore = 1000 * multiple;
                    break;
                case SlideBase:
                    baseScore = 1500 * multiple;
                    break;
            }
            if (!judgeResult.IsBreak)
            {
                switch (judgeResult.Grade)
                {
                    case JudgeGrade.Miss:
                    case JudgeGrade.TooFast:
                        //CurrentNoteBaseScore += baseScore * 0;
                        LostNoteBaseScore += baseScore;
                        break;
                    case JudgeGrade.LateGood:
                    case JudgeGrade.FastGood:
                        CurrentNoteBaseScore += (long)(baseScore * 0.5);
                        LostNoteBaseScore += (long)(baseScore * 0.5);
                        break;
                    case JudgeGrade.LateGreat3rd:
                    case JudgeGrade.LateGreat2nd:
                    case JudgeGrade.LateGreat:
                    case JudgeGrade.FastGreat:
                    case JudgeGrade.FastGreat2nd:
                    case JudgeGrade.FastGreat3rd:
                        CurrentNoteBaseScore += (long)(baseScore * 0.8);
                        LostNoteBaseScore += (long)(baseScore * 0.2);
                        break;
                    default:
                        CurrentNoteBaseScore += baseScore;
                        //LostNoteBaseScore += 0;
                        break;
                }
            }
            else
            {

                switch (judgeResult.Grade)
                {
                    case JudgeGrade.Miss:
                    case JudgeGrade.TooFast:
                        LostNoteBaseScore += 2500 * multiple;
                        LostNoteExtraScore += 100 * multiple;
                        LostNoteExtraScoreClassic += 100 * multiple;
                        break;
                    case JudgeGrade.LateGood:
                    case JudgeGrade.FastGood:
                        CurrentNoteBaseScore += 1000 * multiple;
                        CurrentNoteExtraScore += 30 * multiple;
                        LostNoteBaseScore += 1500 * multiple;
                        LostNoteExtraScore += 70 * multiple;
                        LostNoteExtraScoreClassic += 100 * multiple;
                        break;
                    case JudgeGrade.LateGreat3rd:
                    case JudgeGrade.FastGreat3rd:
                        CurrentNoteBaseScore += 1250 * multiple;
                        CurrentNoteExtraScore += 40 * multiple;
                        LostNoteBaseScore += 1250 * multiple;
                        LostNoteExtraScore += 60 * multiple;
                        LostNoteExtraScoreClassic += 100 * multiple;
                        break;
                    case JudgeGrade.FastGreat2nd:
                    case JudgeGrade.LateGreat2nd:
                        CurrentNoteBaseScore += 1500 * multiple;
                        CurrentNoteExtraScore += 40 * multiple;
                        LostNoteBaseScore += 1000 * multiple;
                        LostNoteExtraScore += 60 * multiple;
                        LostNoteExtraScoreClassic += 100 * multiple;
                        break;
                    case JudgeGrade.LateGreat:
                    case JudgeGrade.FastGreat:
                        CurrentNoteBaseScore += 2000 * multiple;
                        CurrentNoteExtraScore += 40 * multiple;
                        LostNoteBaseScore += 500 * multiple;
                        LostNoteExtraScore += 60 * multiple;
                        LostNoteExtraScoreClassic += 100 * multiple;
                        break;
                    case JudgeGrade.LatePerfect3rd:
                    case JudgeGrade.FastPerfect3rd:
                        CurrentNoteBaseScore += 2500 * multiple;
                        CurrentNoteExtraScore += 50 * multiple;
                        LostNoteExtraScore += 50 * multiple;
                        LostNoteExtraScoreClassic += 100 * multiple;
                        break;
                    case JudgeGrade.LatePerfect2nd:
                    case JudgeGrade.FastPerfect2nd:
                        CurrentNoteBaseScore += 2500 * multiple;
                        CurrentNoteExtraScore += 75 * multiple;
                        CurrentNoteExtraScoreClassic += 50 * multiple;
                        LostNoteExtraScore += 25 * multiple;
                        LostNoteExtraScoreClassic += 50 * multiple;
                        break;
                    case JudgeGrade.Perfect:
                        CurrentNoteBaseScore += 2500 * multiple;
                        CurrentNoteExtraScore += 100 * multiple;
                        CurrentNoteExtraScoreClassic += 100 * multiple;
                        LostNoteExtraScore += 0 * multiple;
                        LostNoteExtraScoreClassic += 0 * multiple;
                        break;
                }
            }
        }
}
