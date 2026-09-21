import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlacesService } from './places.service';
import { AutocompleteDto } from './dto/autocomplete.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get('autocomplete')
  autocomplete(@Query() query: AutocompleteDto) {
    return this.places.autocomplete(query.q, query.sessionToken);
  }

  @Get('details')
  details(
    @Query('placeId') placeId: string,
    @Query('sessionToken') sessionToken?: string,
  ) {
    if (!placeId) {
      throw new BadRequestException('placeId is required');
    }
    return this.places.details(placeId, sessionToken);
  }
}
