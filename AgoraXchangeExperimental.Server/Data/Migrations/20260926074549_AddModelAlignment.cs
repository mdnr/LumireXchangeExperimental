using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AgoraXchangeExperimental.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddModelAlignment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Only the new column. The EF 10 tooling also emitted a no-op
            // AlterColumn on the Id primary key, re-applying the type and the
            // Sqlite autoincrement annotation it already had. Left out on
            // purpose: touching a primary key for no reason is not worth the
            // risk of a table rebuild against live rows.
            migrationBuilder.AddColumn<string>(
                name: "ModelAlignmentJson",
                table: "Products",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ModelAlignmentJson",
                table: "Products");
        }
    }
}
