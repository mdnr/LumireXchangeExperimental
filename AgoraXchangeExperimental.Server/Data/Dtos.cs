namespace AgoraXchangeExperimental.Server.Data;

using System.Text.Json;

public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
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

public class SellerDto
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
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