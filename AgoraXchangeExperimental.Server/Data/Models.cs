using Microsoft.AspNetCore.Identity;

namespace AgoraXchangeExperimental.Server.Data;

public class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Product
{
    public int Id { get; set; }
    public required string Slug { get; set; }
    public required string Name { get; set; }
    public required string Tagline { get; set; }
    public required string Description { get; set; }
    public decimal Price { get; set; }
    public required string Category { get; set; }
    public bool BestSeller { get; set; }
    public required string SellerId { get; set; }
    public AppUser? Seller { get; set; }
    public List<string> ImageUrls { get; set; } = [];
    public List<string> Colors { get; set; } = [];
    public string SpecsJson { get; set; } = "[]";
    public string FeaturesJson { get; set; } = "[]";
    public string VariantsJson { get; set; } = "[]";
    public string ModelMaterialsJson { get; set; } = "[]";
    public string ColorPresetsJson { get; set; } = "[]";
    public string? ModelUrl { get; set; }
    public string? ModelPosterUrl { get; set; }
    public MaterialSettings Material { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class MaterialSettings
{
    public string SurfaceType { get; set; } = "color"; // "color" | "texture"
    public string Color { get; set; } = "#e8e8e8";
    public string? TextureUrl { get; set; }
    public string Finish { get; set; } = "matte"; // "matte" | "chrome"
    public double Metalness { get; set; } = 0.2;
    public double Roughness { get; set; } = 0.55;
    public double Clearcoat { get; set; } = 0;
}

public class ColorVariant
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Hex { get; set; } = "#e8e8e8";
    public string? ImageUrl { get; set; }
    public int? PhotoIndex { get; set; }
    public int? MaterialIndex { get; set; }
    public MaterialSettings? Material { get; set; }
    public List<ModelMaterial>? ModelMaterials { get; set; }
}

public class ModelMaterial
{
    public int Index { get; set; }
    public string Label { get; set; } = string.Empty;
    public MaterialSettings Settings { get; set; } = new();
}

public class ColorPreset
{
    public string Name { get; set; } = string.Empty;
    public MaterialSettings Material { get; set; } = new();
    public List<ModelMaterial> Materials { get; set; } = [];
}