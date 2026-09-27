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
    public string ModelAlignmentJson { get; set; } = "";
    public MaterialSettings Material { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// How a model sits on a wrist, chosen by the seller against a reference hand and
// then applied verbatim at try-on time. Every GLB is authored differently: dial
// on any of the three axes, band running any way, case tipped off square. Inferring
// that from geometry is guesswork, so the seller states it once and it is stored.
//
// Rotation is a quaternion, not Euler angles, because the order and the frame an
// angle is measured in are exactly the details that go wrong when a transform is
// round-tripped through storage. Offsets are in wrist widths, the same unit the
// tracker measures the wrist in, so one saved alignment fits any hand size.
public class ModelAlignment
{
    public float QuatX { get; set; }
    public float QuatY { get; set; }
    public float QuatZ { get; set; }
    public float QuatW { get; set; } = 1f;
    public double OffsetX { get; set; }
    public double OffsetY { get; set; }
    public double OffsetZ { get; set; }
    public double Scale { get; set; } = 1d;
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
    // How see-through the part is: 0 opaque, 1 invisible. Distinct from
    // Clearcoat, which is a shiny second specular lobe and stays code-driven
    // (the Chrome preset), because the two were briefly sharing one slider and
    // every stored Clearcoat in the database is a clear-coat value, not an
    // opacity one. Reinterpreting those would have made existing parts vanish.
    public double Transparency { get; set; } = 0;
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
    // Immutable matcher: the material's original name inside the GLB. Kept hidden
    // from the UI so renaming the user-visible Label can never break recolouring.
    public string GlbName { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public MaterialSettings Settings { get; set; } = new();
}

public class ColorPreset
{
    public string Name { get; set; } = string.Empty;
    public MaterialSettings Material { get; set; } = new();
    public List<ModelMaterial> Materials { get; set; } = [];
}