import { CreateEventTypeInput } from "@/ee/event-types/inputs/create-event-type.input";
import { EventTypesService } from "@/ee/event-types/services/event-types.service";
import { ForAtom } from "@/lib/atoms/decorators/for-atom.decorator";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { Permissions } from "@/modules/auth/decorators/permissions/permissions.decorator";
import { AccessTokenGuard } from "@/modules/auth/guards/access-token/access-token.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { UserWithProfile } from "@/modules/users/users.repository";
import { Controller, UseGuards, Get, Param, Post, Body, NotFoundException } from "@nestjs/common";
import { EventType } from "@prisma/client";

import { EventTypesByViewer } from "@calcom/lib";
import { EVENT_TYPE_READ, EVENT_TYPE_WRITE, SUCCESS_STATUS } from "@calcom/platform-constants";
import { createEventType } from "@calcom/platform-libraries";
import type { EventType as AtomEventType, EventTypesPublic } from "@calcom/platform-libraries";
import { getEventTypesByViewer } from "@calcom/platform-libraries";
import { ApiResponse, ApiSuccessResponse } from "@calcom/platform-types";

@Controller({
  path: "event-types",
  version: "2",
})
@UseGuards(PermissionsGuard)
export class EventTypesController {
  constructor(private readonly eventTypesService: EventTypesService) {}

  @Post("/")
  @Permissions([EVENT_TYPE_WRITE])
  @UseGuards(AccessTokenGuard)
  async createEventType(
    @Body() body: CreateEventTypeInput,
    @GetUser() user: UserWithProfile
  ): Promise<ApiResponse<EventType>> {
    const eventType = await createEventType({
      input: body,
      ctx: { user },
    });

    return {
      status: SUCCESS_STATUS,
      data: eventType,
    };
  }

  @Get("/:eventTypeId")
  @Permissions([EVENT_TYPE_READ])
  @UseGuards(AccessTokenGuard)
  async getEventType(
    @Param("eventTypeId") eventTypeId: string,
    @ForAtom() forAtom: boolean,
    @GetUser() user: UserWithProfile
  ): Promise<ApiSuccessResponse<EventType | AtomEventType>> {
    const eventType = forAtom
      ? await this.eventTypesService.getUserEventTypeForAtom(user, Number(eventTypeId))
      : await this.eventTypesService.getUserEventType(user.id, Number(eventTypeId));

    if (!eventType) {
      throw new NotFoundException(`Event type with id ${eventTypeId} not found`);
    }

    return {
      status: SUCCESS_STATUS,
      data: eventType,
    };
  }

  @Get("/")
  @Permissions([EVENT_TYPE_READ])
  @UseGuards(AccessTokenGuard)
  async getEventTypes(@GetUser() user: UserWithProfile): Promise<ApiSuccessResponse<EventTypesByViewer>> {
    const eventTypes = await getEventTypesByViewer({
      id: user.id,
      profile: {
        upId: `usr-${user.id}`,
      },
    });

    return {
      status: SUCCESS_STATUS,
      data: eventTypes,
    };
  }

  @Get("/:username/public")
  @Permissions([EVENT_TYPE_READ])
  async getPublicEventTypes(
    @Param("username") username: string
  ): Promise<ApiSuccessResponse<EventTypesPublic>> {
    const eventTypes = await this.eventTypesService.getEventTypesPublicByUsername(username);

    return {
      status: SUCCESS_STATUS,
      data: eventTypes,
    };
  }
}
