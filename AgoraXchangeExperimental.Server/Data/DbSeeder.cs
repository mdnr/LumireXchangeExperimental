using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AgoraXchangeExperimental.Server.Data;

public static class DbSeeder
{
    public const string DemoSellerEmail = "seller@lumiere.app";
    public const string DemoSellerPassword = "Seller123!";
    public const string DemoBuyerEmail = "buyer@lumiere.app";
    public const string DemoBuyerPassword = "Buyer123!";

    // Owns the seeded catalogue outside Development. The password is random and
    // never shown, so nobody can sign in as it — sellers register their own
    // accounts through /api/auth/register.
    private const string CatalogOwnerEmail = "catalog@lumiere.app";

    /// <param name="includeDemoAccounts">
    /// When false (production) the publicly documented seller@lumiere.app and
    /// buyer@lumiere.app logins are not created, and any left behind by an
    /// earlier deployment are removed.
    /// </param>
    public static async Task SeedAsync(IServiceProvider services, bool includeDemoAccounts = true)
    {
        var db = services.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();

        var userManager = services.GetRequiredService<UserManager<AppUser>>();
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();

        foreach (var role in new[] { "Seller", "User" })
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }

        var seller = includeDemoAccounts
            ? await EnsureUser(userManager, DemoSellerEmail, DemoSellerPassword, "Lumière Studio", "Seller")
            : await EnsureUser(userManager, CatalogOwnerEmail, RandomPassword(), "Lumière Studio", "Seller");
        if (includeDemoAccounts)
        {
            await EnsureUser(userManager, DemoBuyerEmail, DemoBuyerPassword, "Demo Buyer", "User");
        }
        else if (seller is not null)
        {
            await RemoveDemoAccountsAsync(db, userManager, seller.Id);
        }

        if (!await db.Products.AnyAsync())
        {
            if (seller is null)
            {
                return;
            }

            var products = new[]
            {
                SeedProduct(seller.Id, "aurora-headphones", "Aurora Pro Headphones", "Immersive studio-grade wireless audio",
                    "Crafted from aerospace-grade aluminium and memory foam, the Aurora Pro delivers reference-quality sound with adaptive noise cancellation and a 40-hour battery. Precision-tuned drivers render every detail, while the feather-light design keeps you comfortable through the longest sessions.",
                    349m, "Audio", true,
                    ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80",
                     "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=1200&q=80",
                     "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=1200&q=80"],
                    ["#1a1a1a", "#d4d4d4", "#8b5e3c"],
                    [("Driver", "50mm dynamic, beryllium-coated"), ("Frequency Response", "5Hz – 40kHz"),
                     ("Battery Life", "40 hours (ANC on)"), ("Noise Cancellation", "Adaptive Hybrid ANC"),
                     ("Connectivity", "Bluetooth 5.4, USB-C"), ("Weight", "254 g")],
                    [("Aerospace materials", "CNC-milled aluminium frame with memory-foam earcups for lasting comfort."),
                     ("Adaptive ANC", "Hybrid noise cancellation that adapts to your environment in real time."),
                     ("40-hour battery", "All-day playback with 10-minute fast charge for 5 hours of use.")]),
                SeedProduct(seller.Id, "pulse-smartwatch", "Pulse X Smartwatch", "Precision health tracking in a refined case",
                    "The Pulse X fuses medical-grade sensors with a machined titanium body. Track heart rate, sleep and recovery around the clock, with a two-week battery and an always-on display that adapts to any ambient light.",
                    399m, "Wearables", false,
                    ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
                     "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=1200&q=80",
                     "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=1200&q=80"],
                    ["#1a1a1a", "#e5e5e5", "#c9a227"],
                    [("Display", "1.4\" AMOLED, 320 ppi"), ("Battery", "14 days typical"),
                     ("Sensors", "HR, SpO2, temperature"), ("Water resistance", "5 ATM"),
                     ("Connectivity", "Bluetooth 5.3"), ("Weight", "42 g")],
                    [("Health insights", "Continuous HR, SpO2 and sleep staging distilled into a daily readiness score."),
                     ("Two-week battery", "Leave the charger at home; fast-charge 0-100% in 40 minutes."),
                     ("Titanium build", "Aerospace titanium case that is feather-light yet scratch-resistant.")]),
                SeedProduct(seller.Id, "echo-speaker", "Echo Sound Speaker", "Room-filling 360° sound, beautifully minimal",
                    "One seamless piece of fabric and aluminium, the Echo fills any room with omnidirectional sound. Dual passive radiators and a custom DSP tune deliver deep bass and crisp highs without a hint of distortion.",
                    199m, "Audio", false,
                    ["https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1200&q=80",
                     "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1200&q=80",
                     "https://images.unsplash.com/photo-1589003077984-894e133dabab?auto=format&fit=crop&w=1200&q=80"],
                    ["#2b2b2b", "#e8e8e8", "#bcd0d8"],
                    [("Drivers", "1 full-range + 2 passive radiators"), ("360° output", "Omnidirectional DSP tune"),
                     ("Connectivity", "Wi-Fi 6, Bluetooth 5.3"), ("Battery", "24 hours"),
                     ("Size", "160 × 160 × 240 mm"), ("Weight", "1.1 kg")],
                    [("True 360°", "Precision-tuned drivers project sound evenly in every direction."),
                     ("Single-piece fabric", "A seamless acoustic mesh hides every component in plain sight."),
                     ("Smart assistant ready", "Pair with your home hub for hands-free control.")]),
                SeedProduct(seller.Id, "lumen-table-lamp", "Lumen Desk Lamp", "Architectural illumination for focused work",
                    "A machined aluminium arm and dial controls bring precise, glare-free light to your desk. Three temperature presets and stepless dimming adapt from deep focus to warm ambient evenings.",
                    149m, "Home", false,
                    ["https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=80",
                     "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=80",
                     "https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=1200&q=80"],
                    ["#e8e8e8", "#1a1a1a"],
                    [("Lumen output", "900 lm, stepless dimming"), ("Color temperature", "2700K – 5500K"),
                     ("Presets", "Focus, work, ambient"), ("Arm", "CNC aluminium, 3-axis"),
                     ("Base", "Cast iron, non-slip"), ("Cable", "2.4 m woven")],
                    [("Zero-glare optics", "A custom lens spreads light so you never see the source."),
                     ("Architectural aluminium", "A sculpted, anodised body that belongs at the desk and the shelf."),
                     ("Dial control", "One machined dial for brightness and preset cycling — no apps needed.")])
            };

            db.Products.AddRange(products);
            await db.SaveChangesAsync();
        }

        await BackfillVariantsAsync(db, services);
        await EnsureColorPresetsAsync(db);
        await BackfillVariantLooksAsync(db);
        await BackfillMaterialNamesAsync(db, services);
    }

    private static async Task BackfillVariantsAsync(AppDbContext db, IServiceProvider services)
    {
        var env = services.GetRequiredService<IWebHostEnvironment>();
        var products = await db.Products.Where(p => string.IsNullOrEmpty(p.VariantsJson) || p.VariantsJson == "[]").ToListAsync();
        foreach (var product in products)
        {
            if (product.Colors.Count == 0)
            {
                continue;
            }

            var variants = product.Colors.Select((hex, i) => new ColorVariant
            {
                Id = i + 1,
                Name = SuggestColorName(hex, i),
                Hex = hex,
                ImageUrl = product.ImageUrls.ElementAtOrDefault(i) ?? product.ImageUrls.FirstOrDefault(),
                PhotoIndex = product.ImageUrls.Count > 0 ? Math.Min(i, product.ImageUrls.Count - 1) : null,
                MaterialIndex = null
            }).ToList();

            var glbPath = Path.Combine(env.ContentRootPath, "wwwroot", "models", $"{product.Slug}.glb");
            var extracted = ModelFileReader.ExtractMaterials(glbPath);
            var materials = extracted.Select((e, i) =>
            {
                var label = string.IsNullOrWhiteSpace(e.Name) ? $"Material {i + 1}" : e.Name;
                var match = variants.FirstOrDefault(v =>
                    v.Name.Equals(label, StringComparison.OrdinalIgnoreCase))?.Hex;
                return new ModelMaterial
                {
                    Index = e.Index,
                    GlbName = e.Name,
                    Label = label,
                    Settings = new MaterialSettings
                    {
                        SurfaceType = "color",
                        Color = match ?? product.Colors[Math.Min(i, product.Colors.Count - 1)],
                        Finish = "matte",
                        Metalness = 0.3,
                        Roughness = 0.45,
                        Clearcoat = 0.15
                    }
                };
            }).ToList();

            for (var i = 0; i < variants.Count; i++)
            {
                variants[i].MaterialIndex = materials.Count > i ? i : null;
            }
            product.ModelMaterialsJson = JsonSerializer.Serialize(materials, Json.Options);
            product.VariantsJson = JsonSerializer.Serialize(variants, Json.Options);
        }
        if (products.Count > 0)
        {
            await db.SaveChangesAsync();
        }
    }

    private static async Task EnsureColorPresetsAsync(AppDbContext db)
    {
        var products = await db.Products.ToListAsync();
        var changed = false;
        foreach (var product in products)
        {
            var materials = Json.JsonList<ModelMaterial>(product.ModelMaterialsJson);
            var presets = Json.JsonList<ColorPreset>(product.ColorPresetsJson);
            var names = new HashSet<string>(presets.Select(p => p.Name), StringComparer.OrdinalIgnoreCase);

            var toAdd = new List<ColorPreset>();
            if (!names.Contains("Classic"))
            {
                toAdd.Add(new ColorPreset
                {
                    Name = "Classic",
                    Material = CloneMaterial(product.Material),
                    Materials = materials.Select(CloneModelMaterial).ToList()
                });
            }
            if (!names.Contains("Noir"))
            {
                toAdd.Add(new ColorPreset
                {
                    Name = "Noir",
                    Material = new MaterialSettings { SurfaceType = "color", Color = "#0d0d10", Finish = "chrome", Metalness = 0.9, Roughness = 0.1, Clearcoat = 0.6 },
                    Materials = materials.Select(m => new ModelMaterial
                    {
                        Index = m.Index,
                        GlbName = m.GlbName,
                        Label = m.Label,
                        Settings = new MaterialSettings { SurfaceType = "color", Color = "#0d0d10", Finish = "chrome", Metalness = 0.9, Roughness = 0.1, Clearcoat = 0.6, TextureUrl = m.Settings.TextureUrl }
                    }).ToList()
                });
            }
            if (!names.Contains("Glacier"))
            {
                toAdd.Add(new ColorPreset
                {
                    Name = "Glacier",
                    Material = new MaterialSettings { SurfaceType = "color", Color = "#eef1f5", Finish = "matte", Metalness = 0.05, Roughness = 0.7, Clearcoat = 0.1 },
                    Materials = materials.Select(m => new ModelMaterial
                    {
                        Index = m.Index,
                        GlbName = m.GlbName,
                        Label = m.Label,
                        Settings = new MaterialSettings { SurfaceType = "color", Color = "#eef1f5", Finish = "matte", Metalness = 0.05, Roughness = 0.7, Clearcoat = 0.1, TextureUrl = m.Settings.TextureUrl }
                    }).ToList()
                });
            }

            if (toAdd.Count > 0)
            {
                presets.AddRange(toAdd);
                product.ColorPresetsJson = JsonSerializer.Serialize(presets, Json.Options);
                changed = true;
            }
        }

        if (changed)
        {
            await db.SaveChangesAsync();
        }
    }

    private static async Task BackfillMaterialNamesAsync(AppDbContext db, IServiceProvider services)
    {
        var env = services.GetRequiredService<IWebHostEnvironment>();
        var products = await db.Products.ToListAsync();
        var changed = false;
        foreach (var product in products)
        {
            var parts = Json.JsonList<ModelMaterial>(product.ModelMaterialsJson);
            var variants = Json.JsonList<ColorVariant>(product.VariantsJson);
            var partsNeedName = parts.Any(m => string.IsNullOrWhiteSpace(m.GlbName));
            var variantsNeedName = variants.Any(v => v.ModelMaterials is { Count: > 0 } ms && ms.Any(m => string.IsNullOrWhiteSpace(m.GlbName)));
            if (!partsNeedName && !variantsNeedName)
            {
                continue;
            }

            var glbNames = new Dictionary<int, string>();
            if (!string.IsNullOrEmpty(product.ModelUrl))
            {
                var glbPath = Path.Combine(env.ContentRootPath, "wwwroot", product.ModelUrl.TrimStart('/'));
                foreach (var e in ModelFileReader.ExtractMaterials(glbPath))
                {
                    if (!string.IsNullOrWhiteSpace(e.Name))
                    {
                        glbNames[e.Index] = e.Name;
                    }
                }
            }

            foreach (var m in parts)
            {
                if (string.IsNullOrWhiteSpace(m.GlbName))
                {
                    m.GlbName = glbNames.TryGetValue(m.Index, out var name) ? name : m.Label;
                }
            }
            foreach (var v in variants)
            {
                if (v.ModelMaterials is null)
                {
                    continue;
                }
                foreach (var m in v.ModelMaterials)
                {
                    if (string.IsNullOrWhiteSpace(m.GlbName))
                    {
                        m.GlbName = glbNames.TryGetValue(m.Index, out var name) ? name : m.Label;
                    }
                }
            }

            product.ModelMaterialsJson = JsonSerializer.Serialize(parts, Json.Options);
            product.VariantsJson = JsonSerializer.Serialize(variants, Json.Options);
            changed = true;
        }

        if (changed)
        {
            await db.SaveChangesAsync();
        }
    }

    private static readonly string[] DefaultTones = { "#e8e8e8", "#e5e5e5", "#f2f2f2", "#f5f5f5", "#ffffff", "#eeeeee", "#e0e0e0", "#d4d4d4", "#c9c9c9" };

    private static bool IsDefaultTone(string hex) =>
        DefaultTones.Contains(hex.Trim().ToLowerInvariant(), StringComparer.OrdinalIgnoreCase);

    private static async Task BackfillVariantLooksAsync(AppDbContext db)
    {
        var products = await db.Products.ToListAsync();
        var changed = false;
        foreach (var product in products)
        {
            var parts = Json.JsonList<ModelMaterial>(product.ModelMaterialsJson);
            var variants = Json.JsonList<ColorVariant>(product.VariantsJson);
            var colors = product.Colors;

            if (variants.Count == 0 && colors.Count == 0 && parts.Count > 0)
            {
                colors = parts
                    .Select(m => m.Settings.Color.Trim())
                    .Where(c => !string.IsNullOrWhiteSpace(c) && !IsDefaultTone(c))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Take(4)
                    .ToList();
            }

            if (variants.Count == 0 && colors.Count > 0)
            {
                variants = colors.Select((hex, i) => new ColorVariant
                {
                    Id = i + 1,
                    Name = SuggestColorName(hex, i),
                    Hex = hex,
                    ImageUrl = product.ImageUrls.ElementAtOrDefault(i) ?? product.ImageUrls.FirstOrDefault(),
                    PhotoIndex = product.ImageUrls.Count > 0 ? Math.Min(i, product.ImageUrls.Count - 1) : null,
                    MaterialIndex = null
                }).ToList();
                product.Colors = colors;
            }

            if (variants.Count == 0 || variants.All(v => v.Material is not null))
            {
                var repaired = false;
                foreach (var variant in variants)
                {
                    if (variant.PhotoIndex is null && !string.IsNullOrEmpty(variant.ImageUrl))
                    {
                        var idx = product.ImageUrls.IndexOf(variant.ImageUrl);
                        if (idx >= 0)
                        {
                            variant.PhotoIndex = idx;
                            repaired = true;
                        }
                    }

                    var suggestion = SuggestColorName(variant.Hex, variant.Id - 1);
                    if (variant.Name == $"Colour {variant.Id}" && suggestion != variant.Name)
                    {
                        variant.Name = suggestion;
                        repaired = true;
                    }
                }
                if (repaired)
                {
                    product.VariantsJson = JsonSerializer.Serialize(variants, Json.Options);
                    changed = true;
                }
                continue;
            }
            foreach (var variant in variants)
            {
                if (variant.Material is not null)
                {
                    continue;
                }

                variant.Material = new MaterialSettings
                {
                    SurfaceType = "color",
                    Color = variant.Hex,
                    Finish = "matte",
                    Metalness = 0.3,
                    Roughness = 0.45,
                    Clearcoat = 0.15
                };
                variant.ModelMaterials = parts.Select(m => new ModelMaterial
                {
                    Index = m.Index,
                    GlbName = m.GlbName,
                    Label = m.Label,
                    Settings = new MaterialSettings
                    {
                        SurfaceType = "color",
                        Color = variant.Hex,
                        Finish = m.Settings.Finish,
                        Metalness = m.Settings.Metalness,
                        Roughness = m.Settings.Roughness,
                        Clearcoat = m.Settings.Clearcoat,
                        TextureUrl = m.Settings.TextureUrl
                    }
                }).ToList();
            }

            product.VariantsJson = JsonSerializer.Serialize(variants, Json.Options);
            changed = true;
        }

        if (changed)
        {
            await db.SaveChangesAsync();
        }
    }

    private static MaterialSettings CloneMaterial(MaterialSettings s) => new()
    {
        SurfaceType = s.SurfaceType,
        Color = s.Color,
        TextureUrl = s.TextureUrl,
        Finish = s.Finish,
        Metalness = s.Metalness,
        Roughness = s.Roughness,
        Clearcoat = s.Clearcoat
    };

    private static ModelMaterial CloneModelMaterial(ModelMaterial m) => new()
    {
        Index = m.Index,
        GlbName = m.GlbName,
        Label = m.Label,
        Settings = CloneMaterial(m.Settings)
    };

    private static string SuggestColorName(string hex, int index)
    {
        var key = hex.ToLowerInvariant();
        return key switch
        {
            "#1a1a1a" or "#000000" or "#101010" or "#2b2b2b" or "#2a2a2a" => "Onyx",
            "#0d0d10" or "#0d0d0d" or "#0f0f0f" => "Noir",
            "#d4d4d4" or "#e5e5e5" or "#e8e8e8" or "#ffffff" => "Pearl",
            "#8b5e3c" or "#7a4f2b" => "Walnut",
            "#c9a227" or "#d4af37" => "Gold",
            "#bcd0d8" or "#a7c4cf" => "Mist",
            _ => $"Colour {index + 1}",
        };
    }

    private static string RandomPassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghijkmnopqrstuvwxyz";
        const string digits = "23456789";
        const string symbols = "!@#$%^&*-_=+";
        var all = upper + lower + digits + symbols;

        // One of each class up front so the result always satisfies the Identity
        // password rules, then shuffled so the classes aren't positionally fixed.
        var chars = new List<char>
        {
            upper[RandomNumberGenerator.GetInt32(upper.Length)],
            lower[RandomNumberGenerator.GetInt32(lower.Length)],
            digits[RandomNumberGenerator.GetInt32(digits.Length)],
            symbols[RandomNumberGenerator.GetInt32(symbols.Length)],
        };
        while (chars.Count < 32)
        {
            chars.Add(all[RandomNumberGenerator.GetInt32(all.Length)]);
        }
        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string(chars.ToArray());
    }

    // A database seeded by an earlier build still holds the public demo logins,
    // and the demo seller owns that catalogue. Move those products to the locked
    // catalog account first, otherwise the FK on Products.SellerId refuses the
    // delete. Idempotent: once the accounts are gone this is a no-op.
    private static async Task RemoveDemoAccountsAsync(AppDbContext db, UserManager<AppUser> userManager, string catalogOwnerId)
    {
        foreach (var email in new[] { DemoSellerEmail, DemoBuyerEmail })
        {
            var demo = await userManager.FindByEmailAsync(email);
            if (demo is null)
            {
                continue;
            }

            var owned = await db.Products.Where(p => p.SellerId == demo.Id).ToListAsync();
            if (owned.Count > 0)
            {
                foreach (var product in owned)
                {
                    product.SellerId = catalogOwnerId;
                }
                await db.SaveChangesAsync();
            }

            await userManager.DeleteAsync(demo);
        }
    }

    private static async Task<AppUser?> EnsureUser(UserManager<AppUser> userManager, string email, string password, string displayName, string role)
    {
        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            user = new AppUser { UserName = email, Email = email, DisplayName = displayName, EmailConfirmed = true };
            var result = await userManager.CreateAsync(user, password);
            if (!result.Succeeded)
            {
                return null;
            }
        }

        if (!await userManager.IsInRoleAsync(user, role))
        {
            await userManager.AddToRoleAsync(user, role);
        }

        return user;
    }

    private static Product SeedProduct(string sellerId, string slug, string name, string tagline, string description, decimal price, string category,
        bool bestSeller, string[] images, string[] colors, (string Label, string Value)[] specs, (string Title, string Description)[] features)
    {
        return new Product
        {
            SellerId = sellerId,
            Slug = slug,
            Name = name,
            Tagline = tagline,
            Description = description,
            Price = price,
            Category = category,
            BestSeller = bestSeller,
            ImageUrls = images.ToList(),
            Colors = colors.ToList(),
            SpecsJson = JsonSerializer.Serialize(specs.Select(s => new SpecDto { Label = s.Label, Value = s.Value }).ToList(), Json.Options),
            FeaturesJson = JsonSerializer.Serialize(features.Select(f => new FeatureDto { Title = f.Title, Description = f.Description }).ToList(), Json.Options),
            ModelUrl = $"/models/{slug}.glb",
            ModelPosterUrl = images[0],
            Material = new MaterialSettings
            {
                SurfaceType = "color",
                Color = slug == "aurora-headphones" ? "#2a2a2a" : "#e8e8e8",
                Finish = "matte",
                Metalness = 0.2,
                Roughness = 0.55,
                Clearcoat = 0
            }
        };
    }
}