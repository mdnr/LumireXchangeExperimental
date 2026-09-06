using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AgoraXchangeExperimental.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddColorPresets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ColorPresetsJson",
                table: "Products",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ColorPresetsJson",
                table: "Products");
        }
    }
}
