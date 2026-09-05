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

    public static async Task SeedAsync(IServiceProvider services)
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

        var seller = await EnsureUser(userManager, DemoSellerEmail, DemoSellerPassword, "Lumière Studio", "Seller");
        var buyer = await EnsureUser(userManager, DemoBuyerEmail, DemoBuyerPassword, "Demo Buyer", "User");

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