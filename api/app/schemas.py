from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Any, Optional, List, Dict, Union
from datetime import datetime, date as DateType
from enum import Enum

ImageDict = Dict[str, Any]

class UserIDList(BaseModel):
    user_ids: List[str]

class UserRole(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"
    KID = "kid"

class TripStatus(str, Enum):
    PLANNING = "planning"
    UPCOMING = "upcoming"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class TripType(str, Enum):
    STANDARD = "standard"
    MULTI_LOCATION = "multiLocation"
    # Legacy value kept so trips created during the cruise-specific rollout keep loading.
    CRUISE = "cruise"

class ItineraryStopType(str, Enum):
    EMBARK = "embark"
    PORT = "port"
    SEA = "sea"
    DEBARK = "debark"

class ChallengeStatus(str, Enum):
    PENDING = 'pending'
    SUBMITTED = 'submitted'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    ERROR = 'error'

class RewardRedemptionStatus(str, Enum):
    REQUESTED = "requested"
    APPROVED = "approved"
    FULFILLED = "fulfilled"
    DENIED = "denied"

class ChallengeCompletion(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='allow')
    image_url: Optional[str] = Field(None, alias='imageUrl')
    status: ChallengeStatus = ChallengeStatus.PENDING
    comment: Optional[str] = None
    points_awarded: int = Field(0, alias='pointsAwarded')
    submitted_at: Optional[datetime] = Field(None, alias='submittedAt')

    @field_validator('submitted_at', mode='before')
    @classmethod
    def validate_submitted_at(cls, v: Any) -> Optional[datetime]:
        if isinstance(v, dict) and 'seconds' in v:
            return datetime.fromtimestamp(v['seconds'])
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v)
        # It might already be a datetime object or a parsable string, so we let Pydantic handle it.
        return v

class ItineraryStop(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='allow')

    id: str
    date: DateType
    type: ItineraryStopType = ItineraryStopType.PORT
    port_name: str = Field(..., alias='portName')
    location: Optional[str] = None
    arrival_time: Optional[str] = Field(None, alias='arrivalTime')
    departure_time: Optional[str] = Field(None, alias='departureTime')
    notes: Optional[str] = None

class Trip(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, use_enum_values=True, model_dump_by_alias=True)

    id: str = Field(..., alias='id')
    name: str
    description: str
    start_date: DateType = Field(..., alias='startDate')
    end_date: DateType = Field(..., alias='endDate')
    location: Optional[str] = None
    status: TripStatus
    participants: List[str]
    owner_id: str = Field(..., alias='ownerId')
    cover_image_url: Optional[str] = Field(None, alias='coverImageUrl')
    cover_image_thumbnail_url: Optional[str] = Field(None, alias='coverImageThumbnailUrl')
    cover_image_resized_url: Optional[str] = Field(None, alias='coverImageResizedUrl')
    budget: Optional[float] = None
    created_at: Optional[datetime] = Field(None, alias='createdAt')
    updated_at: Optional[datetime] = Field(None, alias='updatedAt')
    vacation_code: Optional[str] = Field(None, alias='vacationCode')
    trip_type: TripType = Field(TripType.STANDARD, alias='tripType')
    itinerary: List[ItineraryStop] = Field(default_factory=list)
        
class TripWithBudget(Trip):
    total_spent: float = Field(0.0, alias='totalSpent')
        
class TripCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: str
    start_date: DateType = Field(..., alias='startDate')
    end_date: DateType = Field(..., alias='endDate')
    location: str
    participants: List[str]
    status: Optional[TripStatus] = TripStatus.UPCOMING
    cover_image_url: Optional[str] = Field(None, alias='coverImageUrl')
    cover_image_thumbnail_url: Optional[str] = Field(None, alias='coverImageThumbnailUrl')
    cover_image_resized_url: Optional[str] = Field(None, alias='coverImageResizedUrl')
    budget: Optional[float] = None
    trip_type: TripType = Field(TripType.STANDARD, alias='tripType')
    itinerary: List[ItineraryStop] = Field(default_factory=list)
    
class TripUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[DateType] = Field(None, alias='startDate')
    end_date: Optional[DateType] = Field(None, alias='endDate')
    location: Optional[str] = None
    status: Optional[TripStatus] = None
    participants: Optional[List[str]] = None
    cover_image_url: Optional[str] = Field(None, alias='coverImageUrl')
    cover_image_thumbnail_url: Optional[str] = Field(None, alias='coverImageThumbnailUrl')
    cover_image_resized_url: Optional[str] = Field(None, alias='coverImageResizedUrl')
    budget: Optional[float] = None
    trip_type: Optional[TripType] = Field(None, alias='tripType')
    itinerary: Optional[List[ItineraryStop]] = None

class TripParticipantsUpdate(BaseModel):
    participant_uids: List[str]

class UserProfileUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: Optional[EmailStr] = None
    phone_number: Optional[str] = Field(None, alias='phoneNumber')
    name: Optional[str] = None
    role: Optional[UserRole] = None
    family_id: Optional[str] = Field(None, alias='familyId')
    is_kid: Optional[bool] = Field(None, alias='isKid')
    trip_ids: Optional[List[str]] = Field(None, alias='tripIds')

class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, use_enum_values=True, model_dump_by_alias=True)

    uid: str
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = Field(None, alias='phoneNumber')
    name: Optional[str] = None
    role: Optional[UserRole] = None
    family_id: Optional[str] = Field(None, alias='familyId')
    pin_hash: Optional[str] = Field(None, alias='pinHash')
    age: Optional[int] = None
    points: Optional[int] = 0
    is_kid: bool = Field(False, alias='isKid')
    share_code: Optional[str] = Field(None, alias='shareCode')
    trip_ids: Optional[List[str]] = Field(default_factory=list, alias='tripIds')

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class TokenRequest(BaseModel):
    token: str

class KidProfileCreate(BaseModel):
    name: str
    pin: str
    age: Optional[int] = None

    @field_validator('pin')
    @classmethod
    def validate_pin_is_4_digits(cls, v: str) -> str:
        # Enforce exactly 4 numeric digits to align with client and COPPA expectations
        if not isinstance(v, str) or not v.isdigit() or len(v) != 4:
            raise ValueError('PIN must be exactly 4 numeric digits')
        return v

class KidPinUpdate(BaseModel):
    pin: str

    @field_validator('pin')
    @classmethod
    def validate_pin_is_4_digits(cls, v: str) -> str:
        if not isinstance(v, str) or not v.isdigit() or len(v) != 4:
            raise ValueError('PIN must be exactly 4 numeric digits')
        return v

class Challenge(BaseModel):
    text: str
    age_group: Optional[str] = Field(None, alias='ageGroup')
    completed: bool = False
    image_url: Optional[str] = Field(None, alias='imageUrl')
    points_awarded: Optional[int] = Field(0, alias='pointsAwarded')
    status: ChallengeStatus = ChallengeStatus.PENDING
    completions: Optional[Dict[str, ChallengeCompletion]] = Field(default_factory=dict)

class ActivityBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    trip_id: str = Field(..., alias='tripId')
    activity_types: Optional[List[str]] = Field(default_factory=list, alias='activityTypes')
    description: Optional[str] = None
    date: Optional[Union[datetime, DateType, str]] = None
    time: Optional[str] = None
    end_time: Optional[str] = Field(None, alias='endTime')
    location: Optional[str] = None
    website: Optional[str] = None
    budget: Optional[float] = None
    cost: Optional[float] = None
    additional_expenses: Optional[float] = Field(None, alias='additionalExpenses')
    budget_category: Optional[str] = Field(None, alias='budgetCategory')
    payment_status: Optional[str] = Field(None, alias='paymentStatus')
    amount_paid: Optional[float] = Field(None, alias='amountPaid')
    cover_image_url: Optional[str] = Field(None, alias='coverImageUrl')
    image_urls: Optional[List[str]] = Field(default_factory=list, alias='imageUrls')
    images: Optional[List[ImageDict]] = Field(default_factory=list)
    challenges: Optional[List[Challenge]] = Field(default_factory=list)
    is_surprise: Optional[bool] = Field(False, alias='isSurprise')
    is_booked: Optional[bool] = Field(False, alias='isBooked')
    is_idea: Optional[bool] = Field(False, alias='isIdea')
    votes: Optional[Dict] = None
    ratings: Optional[Dict] = None
    hidden_from: Optional[List[str]] = Field(default_factory=list, alias='hiddenFrom')
    price_range: Optional[str] = Field(None, alias='priceRange')
    itinerary_stop_id: Optional[str] = Field(None, alias='itineraryStopId')
    itinerary_date: Optional[str] = Field(None, alias='itineraryDate')
    port_name: Optional[str] = Field(None, alias='portName')

class ActivityCreate(ActivityBase):
    pass

class ActivityUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    trip_id: Optional[str] = Field(None, alias='tripId')
    activity_types: Optional[List[str]] = Field(None, alias='activityTypes')
    description: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    end_time: Optional[str] = Field(None, alias='endTime')
    location: Optional[str] = None
    website: Optional[str] = None
    budget: Optional[float] = None
    cost: Optional[float] = None
    additional_expenses: Optional[float] = Field(None, alias='additionalExpenses')
    budget_category: Optional[str] = Field(None, alias='budgetCategory')
    payment_status: Optional[str] = Field(None, alias='paymentStatus')
    amount_paid: Optional[float] = Field(None, alias='amountPaid')
    cover_image_url: Optional[str] = Field(None, alias='coverImageUrl')
    image_urls: Optional[List[str]] = Field(None, alias='imageUrls')
    images: Optional[List[ImageDict]] = None
    challenges: Optional[List[Challenge]] = None
    is_surprise: Optional[bool] = Field(None, alias='isSurprise')
    is_booked: Optional[bool] = Field(None, alias='isBooked')
    is_idea: Optional[bool] = Field(None, alias='isIdea')
    votes: Optional[Dict] = None
    ratings: Optional[Dict] = None
    hidden_from: Optional[List[str]] = Field(None, alias='hiddenFrom')
    price_range: Optional[str] = Field(None, alias='priceRange')
    itinerary_stop_id: Optional[str] = Field(None, alias='itineraryStopId')
    itinerary_date: Optional[str] = Field(None, alias='itineraryDate')
    port_name: Optional[str] = Field(None, alias='portName')

class Activity(ActivityBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, model_dump_by_alias=True)

    id: str
    mood: Optional[str] = None  # Consider Enum for specific moods

class ActivityVote(BaseModel):
    vote: str # Can be 'happy', 'neutral', 'sad'

class ActivityRating(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="A rating from 1 to 5.")
    feedback: Optional[str] = None

class KidLogin(BaseModel):
    uid: str
    pin: str

    @field_validator('pin')
    @classmethod
    def validate_pin_is_4_digits(cls, v: str) -> str:
        if not isinstance(v, str) or not v.isdigit() or len(v) != 4:
            raise ValueError('PIN must be exactly 4 numeric digits')
        return v

class PublicUserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, use_enum_values=True, model_dump_by_alias=True)
    
    uid: str
    name: Optional[str] = None
    role: Optional[UserRole] = None
    is_kid: bool = Field(False, alias='isKid')

class MemberUserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, use_enum_values=True, model_dump_by_alias=True)

    uid: str
    name: Optional[str] = None
    role: Optional[UserRole] = None
    family_id: Optional[str] = Field(None, alias='familyId')
    is_kid: bool = Field(False, alias='isKid')
    age: Optional[int] = None
    points: Optional[int] = 0

class FamilyMemberUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None

class FamilyId(BaseModel):
    model_config = ConfigDict(model_dump_by_alias=True)
    family_id: str = Field(..., alias="familyId")
    
# Rewards Schemas
class RewardBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: str
    description: Optional[str] = None
    pointsCost: int
    icon: Optional[str] = None
    isActive: bool = True

class RewardCreate(RewardBase):
    pass

class RewardUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: Optional[str] = None
    description: Optional[str] = None
    pointsCost: Optional[int] = None
    icon: Optional[str] = None
    isActive: Optional[bool] = None

class Reward(RewardBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: str
    familyId: str
    isRedeemed: bool = False
    redeemedBy: Optional[str] = None
    redeemedAt: Optional[datetime] = None
    createdAt: Optional[datetime] = None 
    updatedAt: Optional[datetime] = None

class RewardRedemptionUpdate(BaseModel):
    status: RewardRedemptionStatus
    note: Optional[str] = None

class RewardRedemption(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    familyId: str
    rewardId: str
    rewardTitle: str
    rewardDescription: Optional[str] = None
    pointsCost: int
    kidId: str
    kidName: Optional[str] = None
    status: RewardRedemptionStatus = RewardRedemptionStatus.REQUESTED
    requestedAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None
    approvedAt: Optional[datetime] = None
    approvedBy: Optional[str] = None
    fulfilledAt: Optional[datetime] = None
    fulfilledBy: Optional[str] = None
    deniedAt: Optional[datetime] = None
    deniedBy: Optional[str] = None
    note: Optional[str] = None

class AdminStats(BaseModel):
    active_trips: int
    family_members: int
    pending_requests: int
