using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AgoraXchangeExperimental.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddColourVariants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ModelMaterialsJson",
                table: "Products",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "VariantsJson",
                table: "Products",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ModelMaterialsJson",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "VariantsJson",
                table: "Products");
        }
    }
}
