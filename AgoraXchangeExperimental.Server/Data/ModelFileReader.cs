using System.Text;
using System.Text.Json;

namespace AgoraXchangeExperimental.Server.Data;

public static class ModelFileReader
{
    public readonly record struct ModelMaterialIndex(int Index, string Name);

    public static List<ModelMaterialIndex> ExtractMaterials(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        string json;
        try
        {
            if (extension == ".glb")
            {
                using var fs = File.OpenRead(filePath);
                json = ReadGlbJson(fs);
            }
            else
            {
                json = File.ReadAllText(filePath);
            }
        }
        catch
        {
            return [new ModelMaterialIndex(0, "")];
        }

        var result = new List<ModelMaterialIndex>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("materials", out var materials) && materials.ValueKind == JsonValueKind.Array)
            {
                var index = 0;
                foreach (var m in materials.EnumerateArray())
                {
                    var name = m.TryGetProperty("name", out var n) ? n.GetString() : null;
                    result.Add(new ModelMaterialIndex(index++, string.IsNullOrWhiteSpace(name) ? "" : name));
                }
            }
        }
        catch
        {
            // best effort
        }

        if (result.Count == 0)
        {
            result.Add(new ModelMaterialIndex(0, ""));
        }

        return result;
    }

    private static string ReadGlbJson(Stream fs)
    {
        if (fs.Length < 12)
        {
            return "{}";
        }

        Span<byte> header = stackalloc byte[12];
        fs.ReadExactly(header);

        Span<byte> chunk = stackalloc byte[8];
        fs.ReadExactly(chunk);
        var chunkLength = (int)(chunk[0] | chunk[1] << 8 | chunk[2] << 16 | chunk[3] << 24);
        var chunkType = chunk[4] | chunk[5] << 8 | chunk[6] << 16 | chunk[7] << 24;
        if (chunkType != 0x4E4F534A || chunkLength <= 0)
        {
            return "{}";
        }

        var buffer = new byte[chunkLength];
        fs.ReadExactly(buffer);
        return Encoding.UTF8.GetString(buffer);
    }
}