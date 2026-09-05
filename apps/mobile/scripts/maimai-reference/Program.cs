using System.Text.Json;
using MajdataViewX.Notes.SlideUtils;
using MajSimai;

if (args[0] == "geometry") {
    SlideTableNeo.InitializeStandardSlideTable();
    var entries = new Dictionary<string, SlideMetadata>(SlideTableNeo.SLIDE_TABLE);
    foreach (var entry in SlideTableNeo.WIFI_TABLE) entries.Add(entry.Key, entry.Value);
    File.WriteAllText(args[1], JsonSerializer.Serialize(entries, new JsonSerializerOptions { IncludeFields = true }));
    File.WriteAllText(args[1] + ".areas.json", JsonSerializer.Serialize(SlideDataBuilder.SlideAreaLookup, new JsonSerializerOptions { IncludeFields = true }));
} else if (args[0] == "parse") {
    var cases = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(args[1]));
    var result = new Dictionary<string, object>();
    foreach (var entry in cases!) {
        try {
            var chart = await SimaiParser.ParseChartAsync(entry.Value);
            result[entry.Key] = new {
                notes = chart.NoteTimings.ToArray().Select(t => new { t.Timing, t.Bpm, t.HSpeed, t.SVeloc, notes = t.Notes.Select(n => new { type = (int)n.Type, n.StartPosition, n.TouchArea, n.HoldTime, n.SlideStartTime, n.SlideTime, n.IsBreak, n.IsEx, n.IsMine, n.IsMineSlide, n.IsSlideBreak, n.IsSlideNoHead, n.IsTapHeadSlide, n.IsForceStar, n.IsFakeRotate, n.IsHanabi, n.UsingSV }).ToArray() }).ToArray(),
                commas = chart.CommaTimings.ToArray().Select(t => new { t.Timing, t.SVeloc, t.SignatureNumerator, t.SignatureDenominator }).ToArray()
            };
        } catch (Exception error) { result[entry.Key] = new { error = error.Message }; }
    }
    File.WriteAllText(args[2], JsonSerializer.Serialize(result, new JsonSerializerOptions { IncludeFields = true }));
} else if (args[0] == "customcases") {
    SlideDataBuilder.InitializeSlideAreaLookup();
    var codes = JsonSerializer.Deserialize<string[]>(File.ReadAllText(args[1]))!;
    var result = new Dictionary<string, object>();
    foreach (var code in codes) {
        try { result[code] = SlideTableNeo.MakeCustomSlide(code); }
        catch (Exception error) { result[code] = new { error = error.Message }; }
    }
    File.WriteAllText(args[2], JsonSerializer.Serialize(result, new JsonSerializerOptions { IncludeFields = true }));
} else if (args[0] == "connected") {
    SlideTableNeo.InitializeStandardSlideTable();
    var cases = JsonSerializer.Deserialize<Dictionary<string, string[]>>(File.ReadAllText(args[1]))!;
    var result = cases.ToDictionary(c => c.Key, c => SlideTableNeo.MakeConnSlide(c.Value.Select(code => SlideTableNeo.SLIDE_TABLE.TryGetValue(code, out var standard) ? standard : SlideTableNeo.MakeCustomSlide(code)).ToArray()));
    File.WriteAllText(args[2], JsonSerializer.Serialize(result, new JsonSerializerOptions { IncludeFields = true }));
} else if (args[0] == "custom") {
    SlideDataBuilder.InitializeSlideAreaLookup();
    Console.WriteLine(JsonSerializer.Serialize(SlideTableNeo.MakeCustomSlide(args[1]), new JsonSerializerOptions { IncludeFields = true }));
}

namespace Unity.Burst { public class BurstCompileAttribute : Attribute {} }
