using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace AgoraXchangeExperimental.Server.Data;

public class AppDbContext : IdentityDbContext<AppUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Product> Products => Set<Product>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Product>(e =>
        {
            e.HasIndex(p => p.Slug).IsUnique();

            e.HasOne(p => p.Seller)
                .WithMany()
                .HasForeignKey(p => p.SellerId);

            e.HasIndex(p => p.Category);

            e.OwnsOne(p => p.Material, m =>
            {
                m.Property(x => x.SurfaceType).IsRequired();
                m.Property(x => x.Color).IsRequired();
            });
        });
    }
}