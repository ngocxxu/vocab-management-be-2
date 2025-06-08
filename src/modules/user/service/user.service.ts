// /**
//  * Get current authenticated user
//  */
// public async getCurrentUser(accessToken: string) {
//     try {
//         const { data, error } = await this.supabase.auth.getUser(accessToken);

//         if (error) {
//             this.handleAuthError(error, 'getCurrentUser');
//         }

//         // Lấy thêm thông tin user từ local DB
//         const user = await this.prismaService.user.findUnique({
//             where: { supabaseUserId: data.user.id },
//             include: {
//                 // Include các relations nếu cần
//                 products: true,
//             }
//         });

//         return user;
//     } catch (error) {
//         if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
//             throw error;
//         }
//         this.logger.error('GetCurrentUser failed:', error);
//         throw new UnauthorizedException('Invalid access token');
//     }
// }
