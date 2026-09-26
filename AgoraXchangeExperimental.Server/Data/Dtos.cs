namespace AgoraXchangeExperimental.Server.Data;

using System.Text.Json;

public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static List<T> JsonList<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<T>>(json, Options) ?? [];
        }
        catch
        {
            return [];
        }
    }

    /// <summary>
    /// A product with no saved alignment returns null, which is not an error: the
    /// buyer page then falls back to the unrotated model so an unaligned product
    /// still shows something rather than failing to load.
    /// </summary>
    public static ModelAlignment? Alignment(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<ModelAlignment>(json, Options);
        }
        catch
        {
            return null;
        }
    }
}

public record AuthResponse(string Token, string Email, string DisplayName, string[] Roles);

public record RegisterRequest(string Email, string Password, string DisplayName, string? Role);

public record LoginRequest(string Email, string Password);

public class MaterialDto
{
    public string SurfaceType { get; set; } = "color";
    public string Color { get; set; } = "#e8e8e8";
    public string? TextureUrl { get; set; }
    public string Finish { get; set; } = "matte";
    public double Metalness { get; set; } = 0.2;
    public double Roughness { get; set; } = 0.55;
    public double Clearcoat { get; set; } = 0;

    public static MaterialDto From(MaterialSettings m) => new()
    {
        SurfaceType = m.SurfaceType,
        Color = m.Color,
        TextureUrl = m.TextureUrl,
        Finish = m.Finish,
        Metalness = m.Metalness,
        Roughness = m.Roughness,
        Clearcoat = m.Clearcoat
    };
}

public class SpecDto
{
    public string Label { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

public class FeatureDto
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public class ColorVariantDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Hex { get; set; } = "#e8e8e8";
    public string? ImageUrl { get; set; }
    public int? PhotoIndex { get; set; }
    public int? MaterialIndex { get; set; }
    public MaterialDto? Material { get; set; }
    public List<ModelMaterialDto>? ModelMaterials { get; set; }

    public static ColorVariantDto From(ColorVariant v) => new()
    {
        Id = v.Id,
        Name = v.Name,
        Hex = v.Hex,
        ImageUrl = v.ImageUrl,
        PhotoIndex = v.PhotoIndex,
        MaterialIndex = v.MaterialIndex,
        Material = v.Material is null ? null : MaterialDto.From(v.Material),
        ModelMaterials = v.ModelMaterials?.Select(ModelMaterialDto.From).ToList()
    };

    public ColorVariant ToModel() => new()
    {
        Id = Id,
        Name = Name,
        Hex = Hex,
        ImageUrl = ImageUrl,
        PhotoIndex = PhotoIndex,
        MaterialIndex = MaterialIndex,
        Material = Material is null ? null : ToMaterial(Material),
        ModelMaterials = ModelMaterials?.Select(ToModelMaterial).ToList()
    };

    private static MaterialSettings ToMaterial(MaterialDto m) => new()
    {
        SurfaceType = m.SurfaceType,
        Color = m.Color,
        TextureUrl = m.TextureUrl,
        Finish = m.Finish,
        Metalness = Math.Clamp(m.Metalness, 0, 1),
        Roughness = Math.Clamp(m.Roughness, 0, 1),
        Clearcoat = Math.Clamp(m.Clearcoat, 0, 1)
    };

    private static ModelMaterial ToModelMaterial(ModelMaterialDto m) => new()
    {
        Index = m.Index,
        GlbName = m.GlbName,
        Label = m.Label,
        Settings = m.Material is null ? new MaterialSettings() : ToMaterial(m.Material)
    };
}

public class ModelMaterialDto
{
    public int Index { get; set; }
    public string GlbName { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public MaterialDto Material { get; set; } = new();

    public static ModelMaterialDto From(ModelMaterial m) => new()
    {
        Index = m.Index,
        GlbName = m.GlbName,
        Label = m.Label,
        Material = MaterialDto.From(m.Settings)
    };
}

public class ColorPresetDto
{
    public string Name { get; set; } = string.Empty;
    public MaterialDto Material { get; set; } = new();
    public List<ModelMaterialDto> ModelMaterials { get; set; } = [];

    public static ColorPresetDto From(ColorPreset p) => new()
    {
        Name = p.Name,
        Material = MaterialDto.From(p.Material),
        ModelMaterials = p.Materials.Select(ModelMaterialDto.From).ToList()
    };
}

public class SellerDto
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
}

// Chosen by the seller on the align page, against a reference hand whose frame is
// fixed and labelled: +X up the forearm, +Y around the wrist, +Z out of the back of
// the hand. Returned to the buyer page and applied verbatim at try-on.
public class ModelAlignmentDto
{
    public float QuatX { get; set; }
    public float QuatY { get; set; }
    public float QuatZ { get; set; }
    public float QuatW { get; set; } = 1f;
    public double OffsetX { get; set; }
    public double OffsetY { get; set; }
    public double OffsetZ { get; set; }
    public double Scale { get; set; } = 1d;

    public static ModelAlignmentDto From(ModelAlignment a) => new()
    {
        QuatX = a.QuatX,
        QuatY = a.QuatY,
        QuatZ = a.QuatZ,
        QuatW = a.QuatW,
        OffsetX = a.OffsetX,
        OffsetY = a.OffsetY,
        OffsetZ = a.OffsetZ,
        Scale = a.Scale
    };

    public ModelAlignment ToModel() => new()
    {
        QuatX = QuatX,
        QuatY = QuatY,
        QuatZ = QuatZ,
        QuatW = QuatW,
        OffsetX = OffsetX,
        OffsetY = OffsetY,
        OffsetZ = OffsetZ,
        Scale = Scale
    };
}

public class ProductSummaryDto
{
    public string Slug { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Tagline { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Category { get; set; } = string.Empty;
    public bool BestSeller { get; set; }
    public List<string> ImageUrls { get; set; } = [];
    public List<string> Colors { get; set; } = [];
    public string? ModelUrl { get; set; }
    public bool HasModel => !string.IsNullOrEmpty(ModelUrl);
    public DateTime CreatedAt { get; set; }

    public static ProductSummaryDto From(Product p) => new()
    {
        Slug = p.Slug,
        Name = p.Name,
        Tagline = p.Tagline,
        Price = p.Price,
        Category = p.Category,
        BestSeller = p.BestSeller,
        ImageUrls = p.ImageUrls,
        Colors = p.Colors,
        ModelUrl = p.ModelUrl,
        CreatedAt = p.CreatedAt
    };
}

public class ProductDto : ProductSummaryDto
{
    public string Description { get; set; } = string.Empty;
    public List<SpecDto> Specs { get; set; } = [];
    public List<FeatureDto> Features { get; set; } = [];
    public string? ModelPosterUrl { get; set; }
    public MaterialDto Material { get; set; } = new();
    public List<ColorVariantDto> Variants { get; set; } = [];
    public List<ModelMaterialDto> ModelMaterials { get; set; } = [];
    public List<ColorPresetDto> ColorPresets { get; set; } = [];
    public ModelAlignmentDto? ModelAlignment { get; set; }
    public SellerDto Seller { get; set; } = new();
    public DateTime UpdatedAt { get; set; }

    public static new ProductDto From(Product p) => new()
    {
        Slug = p.Slug,
        Name = p.Name,
        Tagline = p.Tagline,
        Description = p.Description,
        Price = p.Price,
        Category = p.Category,
        BestSeller = p.BestSeller,
        ImageUrls = p.ImageUrls,
        Colors = p.Colors,
        ModelUrl = p.ModelUrl,
        ModelPosterUrl = p.ModelPosterUrl,
        Specs = JsonSerializer.Deserialize<List<SpecDto>>(p.SpecsJson, Json.Options) ?? [],
        Features = JsonSerializer.Deserialize<List<FeatureDto>>(p.FeaturesJson, Json.Options) ?? [],
        Material = MaterialDto.From(p.Material),
        Variants = Json.JsonList<ColorVariant>(p.VariantsJson).Select(ColorVariantDto.From).ToList(),
        ModelMaterials = Json.JsonList<ModelMaterial>(p.ModelMaterialsJson).Select(ModelMaterialDto.From).ToList(),
        ColorPresets = Json.JsonList<ColorPreset>(p.ColorPresetsJson).Select(ColorPresetDto.From).ToList(),
        ModelAlignment = Json.Alignment(p.ModelAlignmentJson) is { } align ? ModelAlignmentDto.From(align) : null,
        Seller = new SellerDto
        {
            Id = p.Seller?.Id ?? p.SellerId,
            DisplayName = p.Seller?.DisplayName ?? string.Empty,
            Email = p.Seller?.Email ?? string.Empty
        },
        CreatedAt = p.CreatedAt,
        UpdatedAt = p.UpdatedAt
    };
}

public class ProductInputDto
{
    public string Name { get; set; } = string.Empty;
    public string Tagline { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Category { get; set; } = string.Empty;
    public bool BestSeller { get; set; }
    public List<string> ImageUrls { get; set; } = [];
    public List<string> Colors { get; set; } = [];
    public List<SpecDto> Specs { get; set; } = [];
    public List<FeatureDto> Features { get; set; } = [];
    public string? ModelUrl { get; set; }
    public string? ModelPosterUrl { get; set; }
    public MaterialDto? Material { get; set; }
    public List<ColorVariantDto> Variants { get; set; } = [];
    public List<ModelMaterialDto> ModelMaterials { get; set; } = [];
    public List<ColorPresetDto> ColorPresets { get; set; } = [];
    // Deliberately absent from the input DTO. Alignment is written only by the
    // dedicated /alignment endpoint, so the full-document product PUT can never
    // clear it by omission: the studio form does not carry the field, and a
    // save-from-the-form must not silently undo the seller's alignment.
}

public static class Slugger
{
    public static string ToSlug(string name)
    {
        var normalized = new string(name.Normalize(System.Text.NormalizationForm.FormD)
            .Where(c => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c)
                != System.Globalization.UnicodeCategory.NonSpacingMark)
            .ToArray())
            .ToLowerInvariant();

        var sb = new System.Text.StringBuilder();
        foreach (var ch in normalized)
        {
            if (char.IsAsciiLetterOrDigit(ch))
            {
                sb.Append(ch);
            }
            else if (ch == ' ' || ch == '-' || ch == '_')
            {
                sb.Append('-');
            }
        }

        var slug = sb.ToString().Trim('-').Replace("--", "-");
        return string.IsNullOrEmpty(slug) ? Guid.NewGuid().ToString("N")[..8] : slug;
    }
}