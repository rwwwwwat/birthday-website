namespace BirthdayWebsite.Api.Media;

public enum MediaKind { Audio, Cover }
public sealed record MediaEntry(string AudioFile, string CoverFile);
public static class MediaCatalog
{
    public static IReadOnlyDictionary<string, MediaEntry> Tracks { get; } =
        new Dictionary<string, MediaEntry>(StringComparer.Ordinal)
        {
            ["cry-for-me"] = new("Cry For Me.Feat. 愛海.-Michita#2CbowT.mp3", "Michita feat. AMIのPurenessからの楽曲Cry For Me (feat. 愛海)をAmazon Musicで.jpg"),
            ["aitaiwa"] = new("会いたいわ-iri#jkFrL.mp3", "＜コラム＞iriが『Mステ』初出演、バイラルヒット「会いたいわ」がもたらした“揺るぎない自信” _ Special _ Billboard JAPAN.jpg"),
            ["danger"] = new("迷人的危险-Dance+Flow#bgzW.mp3", "迷人的危險 - dance flow_ Song Lyrics, Music Videos & Concerts.jpg"),
            ["kataomoi"] = new("カタオモイ-Aimer#gfokU.mp3", "”カタオモイ” by Aimer - トラック・歌詞情報 _ AWA.jpg"),
        }.AsReadOnly();
}
