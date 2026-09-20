using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using AgoraXchangeExperimental.Server.Data;
using AgoraXchangeExperimental.Server.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Add service defaults & Aspire client integrations.
builder.AddServiceDefaults();

// Add services to the container.
builder.Services.AddProblemDetails();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

// --- Database ---
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=app.db";

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(connectionString));

// --- Identity + JWT ---
builder.Services.AddIdentityCore<AppUser>(options =>
{
    options.Password.RequireDigit = true;
    options.Password.RequireLowercase = true;
    options.Password.RequireUppercase = true;
    options.Password.RequireNonAlphanumeric = true;
    options.Password.RequiredLength = 8;
    options.User.RequireUniqueEmail = true;
})
.AddRoles<IdentityRole>()
.AddEntityFrameworkStores<AppDbContext>();

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
var jwt = new JwtOptions();
builder.Configuration.GetSection("Jwt").Bind(jwt);

builder.Services.AddSingleton<JwtService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization();

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 300 * 1024 * 1024;
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 300 * 1024 * 1024;
});

var app = builder.Build();

// Seed database on startup
using (var scope = app.Services.CreateScope())
{
    await DbSeeder.SeedAsync(scope.ServiceProvider);
}

// Configure the HTTP request pipeline.
app.UseExceptionHandler();
app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();

// ---------- Auth endpoints ----------
var authApi = app.MapGroup("/api/auth");

authApi.MapPost("/register", async (RegisterRequest req, UserManager<AppUser> userManager, RoleManager<IdentityRole> roleManager, JwtService jwtService) =>
{
    if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password) || string.IsNullOrWhiteSpace(req.DisplayName))
    {
        return Results.BadRequest(new { error = "Email, password and display name are required." });
    }

    var roles = new List<string> { "User" };
    if (!string.IsNullOrWhiteSpace(req.Role) && req.Role.Equals("seller", StringComparison.OrdinalIgnoreCase))
    {
        if (!await roleManager.RoleExistsAsync("Seller"))
        {
            await roleManager.CreateAsync(new IdentityRole("Seller"));
        }
        roles.Add("Seller");
    }

    var user = new AppUser
    {
        UserName = req.Email,
        Email = req.Email,
        DisplayName = req.DisplayName,
        EmailConfirmed = true
    };

    var result = await userManager.CreateAsync(user, req.Password);
    if (!result.Succeeded)
    {
        return Results.BadRequest(new { error = string.Join(", ", result.Errors.Select(e => e.Description)) });
    }

    await userManager.AddToRolesAsync(user, roles);
    var token = jwtService.CreateToken(user.Id, user.Email!, user.DisplayName, roles);
    return Results.Ok(new AuthResponse(token, user.Email!, user.DisplayName, [.. roles]));
})
.WithName("Register");

authApi.MapPost("/login", async (LoginRequest req, UserManager<AppUser> userManager, JwtService jwtService) =>
{
    var user = await userManager.FindByEmailAsync(req.Email);
    if (user is null || !await userManager.CheckPasswordAsync(user, req.Password))
    {
        return Results.Unauthorized();
    }

    var roles = await userManager.GetRolesAsync(user);
    var token = jwtService.CreateToken(user.Id, user.Email!, user.DisplayName, roles);
    return Results.Ok(new AuthResponse(token, user.Email!, user.DisplayName, [.. roles]));
})
.WithName("Login");

authApi.MapGet("/me", async (ClaimsPrincipal principal, UserManager<AppUser> userManager) =>
{
    var user = await userManager.GetUserAsync(principal);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var roles = await userManager.GetRolesAsync(user);
    return Results.Ok(new { user.Email, user.DisplayName, Roles = roles });
})
.RequireAuthorization();

// ---------- Product endpoints ----------
var productsApi = app.MapGroup("/api/products");

productsApi.MapGet("/", async (AppDbContext db, string? category, string? sort) =>
{
    var query = db.Products.AsNoTracking().AsQueryable();

    if (!string.IsNullOrWhiteSpace(category))
    {
        query = query.Where(p => p.Category == category);
    }

    query = sort switch
    {
        "price-asc" => query.OrderBy(p => p.Price),
        "price-desc" => query.OrderByDescending(p => p.Price),
        _ => query.OrderByDescending(p => p.CreatedAt)
    };

    var products = await query.Select(p => ProductSummaryDto.From(p)).ToListAsync();
    var categories = await db.Products.AsNoTracking().Select(p => p.Category).Distinct().OrderBy(c => c).ToListAsync();

    return Results.Ok(new { products, categories });
})
.WithName("ListProducts");

productsApi.MapGet("/{slug}", async (AppDbContext db, string slug) =>
{
    var product = await db.Products.AsNoTracking()
        .Include(p => p.Seller)
        .FirstOrDefaultAsync(p => p.Slug == slug);

    if (product is null)
    {
        return Results.NotFound();
    }

    var related = await db.Products.AsNoTracking()
        .Where(p => p.Category == product.Category && p.Slug != product.Slug)
        .OrderBy(p => p.CreatedAt)
        .Take(4)
        .Select(p => ProductSummaryDto.From(p))
        .ToListAsync();

    return Results.Ok(new { product = ProductDto.From(product), related });
})
.WithName("GetProduct");

productsApi.MapGet("/{slug}/related", async (AppDbContext db, string slug) =>
{
    var product = await db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Slug == slug);
    if (product is null)
    {
        return Results.NotFound();
    }

    var related = await db.Products.AsNoTracking()
        .Where(p => p.Category == product.Category && p.Slug != product.Slug)
        .Take(4)
        .Select(p => ProductSummaryDto.From(p))
        .ToListAsync();

    return Results.Ok(related);
})
.WithName("RelatedProducts");

productsApi.MapPost("/", async (ProductInputDto input, ClaimsPrincipal principal, UserManager<AppUser> userManager, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(input.Name))
    {
        return Results.BadRequest(new { error = "Product name is required." });
    }

    var seller = await userManager.GetUserAsync(principal);
    if (seller is null)
    {
        return Results.Unauthorized();
    }

    var slug = Slugger.ToSlug(input.Name);
    var uniqueSlug = slug;
    var counter = 2;
    while (await db.Products.AnyAsync(p => p.Slug == uniqueSlug))
    {
        uniqueSlug = $"{slug}-{counter++}";
    }

    var product = new Product
    {
        Slug = uniqueSlug,
        Name = input.Name,
        Tagline = input.Tagline,
        Description = input.Description,
        Price = input.Price,
        Category = input.Category,
        BestSeller = input.BestSeller,
        ImageUrls = input.ImageUrls,
        Colors = input.Colors,
        SpecsJson = JsonSerializer.Serialize(input.Specs, Json.Options),
        FeaturesJson = JsonSerializer.Serialize(input.Features, Json.Options),
        VariantsJson = JsonSerializer.Serialize(input.Variants.Select(v => v.ToModel()).ToList(), Json.Options),
        ModelMaterialsJson = JsonSerializer.Serialize(input.ModelMaterials.Select(ToModel).ToList(), Json.Options),
        ColorPresetsJson = JsonSerializer.Serialize(input.ColorPresets.Select(ToPreset).ToList(), Json.Options),
        ModelUrl = input.ModelUrl,
        ModelPosterUrl = input.ModelPosterUrl,
        SellerId = seller.Id
    };

    if (input.Material is not null)
    {
        product.Material = MapMaterial(input.Material);
    }

    db.Products.Add(product);
    await db.SaveChangesAsync();

    var created = await db.Products.AsNoTracking().Include(p => p.Seller).FirstAsync(p => p.Slug == uniqueSlug);
    return Results.Created($"/api/products/{uniqueSlug}", ProductDto.From(created));
})
.RequireAuthorization(policy => policy.RequireRole("Seller"))
.WithName("CreateProduct");

productsApi.MapPut("/{slug}", async (string slug, ProductInputDto input, ClaimsPrincipal principal, UserManager<AppUser> userManager, AppDbContext db) =>
{
    var seller = await userManager.GetUserAsync(principal);
    if (seller is null)
    {
        return Results.Unauthorized();
    }

    var product = await db.Products.Include(p => p.Seller).FirstOrDefaultAsync(p => p.Slug == slug);
    if (product is null)
    {
        return Results.NotFound();
    }

    if (product.SellerId != seller.Id)
    {
        return Results.Forbid();
    }

    if (string.IsNullOrWhiteSpace(input.Name))
    {
        return Results.BadRequest(new { error = "Product name is required." });
    }

    product.Name = input.Name;
    product.Tagline = input.Tagline;
    product.Description = input.Description;
    product.Price = input.Price;
    product.Category = input.Category;
    product.BestSeller = input.BestSeller;
    product.ImageUrls = input.ImageUrls;
    product.Colors = input.Colors;
    product.SpecsJson = JsonSerializer.Serialize(input.Specs, Json.Options);
    product.FeaturesJson = JsonSerializer.Serialize(input.Features, Json.Options);
    product.VariantsJson = JsonSerializer.Serialize(input.Variants.Select(v => v.ToModel()).ToList(), Json.Options);
    product.ModelMaterialsJson = JsonSerializer.Serialize(input.ModelMaterials.Select(ToModel).ToList(), Json.Options);
    product.ColorPresetsJson = JsonSerializer.Serialize(input.ColorPresets.Select(ToPreset).ToList(), Json.Options);
    product.ModelUrl = input.ModelUrl;
    product.ModelPosterUrl = input.ModelPosterUrl;
    if (input.Material is not null)
    {
        product.Material = MapMaterial(input.Material);
    }
    product.UpdatedAt = DateTime.UtcNow;

    await db.SaveChangesAsync();

    var updated = await db.Products.AsNoTracking().Include(p => p.Seller).FirstAsync(p => p.Slug == slug);
    return Results.Ok(ProductDto.From(updated));
})
.RequireAuthorization(policy => policy.RequireRole("Seller"))
.WithName("UpdateProduct");

productsApi.MapDelete("/{slug}", async (string slug, ClaimsPrincipal principal, UserManager<AppUser> userManager, AppDbContext db, IWebHostEnvironment env) =>
{
    var seller = await userManager.GetUserAsync(principal);
    if (seller is null)
    {
        return Results.Unauthorized();
    }

    var product = await db.Products.FirstOrDefaultAsync(p => p.Slug == slug);
    if (product is null)
    {
        return Results.NotFound();
    }

    if (product.SellerId != seller.Id)
    {
        return Results.Forbid();
    }

    if (!string.IsNullOrEmpty(product.ModelUrl) && product.ModelUrl.StartsWith("/models/"))
    {
        var filePath = Path.Combine(env.ContentRootPath, "wwwroot", product.ModelUrl.TrimStart('/'));
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
        }
    }

    foreach (var imageUrl in product.ImageUrls.Where(u => u.StartsWith("/images/")))
    {
        var imagePath = Path.Combine(env.ContentRootPath, "wwwroot", imageUrl.TrimStart('/'));
        if (File.Exists(imagePath))
        {
            File.Delete(imagePath);
        }
    }

    db.Products.Remove(product);
    await db.SaveChangesAsync();
    return Results.NoContent();
})
.RequireAuthorization(policy => policy.RequireRole("Seller"))
.WithName("DeleteProduct");

productsApi.MapPost("/{slug}/model", async (string slug, IFormFile? file, ClaimsPrincipal principal, UserManager<AppUser> userManager, AppDbContext db, IWebHostEnvironment env) =>
{
    var seller = await userManager.GetUserAsync(principal);
    if (seller is null)
    {
        return Results.Unauthorized();
    }

    if (file is null || file.Length == 0)
    {
        return Results.BadRequest(new { error = "A model file is required." });
    }

    var allowedExtensions = new[] { ".glb", ".gltf" };
    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (!allowedExtensions.Contains(extension))
    {
        return Results.BadRequest(new { error = "Only .glb or .gltf files are allowed." });
    }

    var product = await db.Products.FirstOrDefaultAsync(p => p.Slug == slug);
    if (product is null)
    {
        return Results.NotFound();
    }

    if (product.SellerId != seller.Id)
    {
        return Results.Forbid();
    }

    var modelsDir = Path.Combine(env.ContentRootPath, "wwwroot", "models");
    Directory.CreateDirectory(modelsDir);

    var fileName = $"{slug}{extension}";
    var savePath = Path.Combine(modelsDir, fileName);

    await using (var stream = new FileStream(savePath, FileMode.Create))
    {
        await file.CopyToAsync(stream);
    }

    product.ModelUrl = $"/models/{fileName}";

    var existingMaterials = Json.JsonList<ModelMaterial>(product.ModelMaterialsJson);
    var variants = Json.JsonList<ColorVariant>(product.VariantsJson);
    var extracted = ModelFileReader.ExtractMaterials(savePath);
    var palette = variants
        .Where(v => v.MaterialIndex is int idx && extracted.Any(e => e.Index == idx))
        .ToDictionary(v => v.MaterialIndex!.Value, v => v.Hex);
    product.ModelMaterialsJson = JsonSerializer.Serialize(extracted.Select(e => new ModelMaterial
    {
        Index = e.Index,
        GlbName = e.Name,
        Label = string.IsNullOrWhiteSpace(e.Name) ? $"Material {e.Index + 1}" : e.Name,
        Settings = existingMaterials.FirstOrDefault(m => m.Index == e.Index)?.Settings
            ?? new MaterialSettings { Color = palette.TryGetValue(e.Index, out var hex) ? hex : "#e8e8e8" }
    }).ToList(), Json.Options);

    foreach (var variant in variants)
    {
        if (variant.MaterialIndex is int idx && !extracted.Any(e => e.Index == idx))
        {
            variant.MaterialIndex = null;
        }
    }
    product.VariantsJson = JsonSerializer.Serialize(variants, Json.Options);

    product.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    var materials = Json.JsonList<ModelMaterial>(product.ModelMaterialsJson);
    return Results.Ok(new
    {
        modelUrl = product.ModelUrl,
        materials = materials.Select(ModelMaterialDto.From).ToList()
    });
})
.RequireAuthorization(policy => policy.RequireRole("Seller"))
.DisableAntiforgery()
.WithName("UploadModel");

productsApi.MapPost("/{slug}/images", async (string slug, IFormFileCollection files, ClaimsPrincipal principal, UserManager<AppUser> userManager, AppDbContext db, IWebHostEnvironment env) =>
{
    var seller = await userManager.GetUserAsync(principal);
    if (seller is null)
    {
        return Results.Unauthorized();
    }

    var product = await db.Products.FirstOrDefaultAsync(p => p.Slug == slug);
    if (product is null)
    {
        return Results.NotFound();
    }

    if (product.SellerId != seller.Id)
    {
        return Results.Forbid();
    }

    var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif" };
    var imagesDir = Path.Combine(env.ContentRootPath, "wwwroot", "images");
    Directory.CreateDirectory(imagesDir);

    var saved = new List<string>();
    foreach (var file in files.Where(f => f is not null && f.Length > 0))
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowedExtensions.Contains(extension))
        {
            continue;
        }

        var fileName = $"{slug}-{Guid.NewGuid().ToString("N")[..8]}{extension}";
        var savePath = Path.Combine(imagesDir, fileName);
        await using (var stream = new FileStream(savePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }
        saved.Add($"/images/{fileName}");
    }

    product.ImageUrls = product.ImageUrls.Concat(saved).ToList();
    product.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    return Results.Ok(new { imageUrls = product.ImageUrls });
})
.RequireAuthorization(policy => policy.RequireRole("Seller"))
.DisableAntiforgery()
.WithName("UploadImages");

app.MapDefaultEndpoints();

// Serve static assets (frontend build + uploaded models). GLB/glTF aren't in the
// default content-type map, so register them explicitly.
var staticContentTypes = new FileExtensionContentTypeProvider();
staticContentTypes.Mappings[".glb"] = "model/gltf-binary";
staticContentTypes.Mappings[".gltf"] = "model/gltf+json";
staticContentTypes.Mappings[".usdz"] = "model/vnd.usdz+zip";

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = staticContentTypes,
    ServeUnknownFileTypes = true
});

// SPA fallback: any route not matched by an API endpoint serves the frontend
// so deep links (e.g. /products/:slug) work in production.
app.MapFallbackToFile("index.html");

app.Run();

static MaterialSettings MapMaterial(MaterialDto m)
{
    var finish = m.Finish.Equals("chrome", StringComparison.OrdinalIgnoreCase) ? "chrome" : "matte";
    var surfaceType = m.SurfaceType.Equals("texture", StringComparison.OrdinalIgnoreCase) ? "texture" : "color";
    return new MaterialSettings
    {
        SurfaceType = surfaceType,
        Color = m.Color,
        TextureUrl = m.TextureUrl,
        Finish = finish,
        Metalness = Math.Clamp(m.Metalness, 0, 1),
        Roughness = Math.Clamp(m.Roughness, 0, 1),
        Clearcoat = Math.Clamp(m.Clearcoat, 0, 1)
    };
}

static ModelMaterial ToModel(ModelMaterialDto m) => new()
{
    Index = m.Index,
    GlbName = m.GlbName,
    Label = m.Label,
    Settings = m.Material is null ? new MaterialSettings() : MapMaterial(m.Material),
};

static ColorPreset ToPreset(ColorPresetDto p) => new()
{
    Name = p.Name,
    Material = p.Material is null ? new MaterialSettings() : MapMaterial(p.Material),
    Materials = p.ModelMaterials.Select(ToModel).ToList(),
};